/****************************************************************************
station.js

Station  = Single measurement-station with one or more parametre.
Only one station pro Location is active within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    /*****************************************************
    Station
    Represent a station with one or more parameters
    *****************************************************/
    nsObservations.Station = function(options, location){
        var _this = this;
        this.id = options.id;
        this.options = options;
        this.location = location;
        this.observationGroup = null; //Is set in location._finally whan all metadata is read

        this.parameterList = [];
        this.parameters = {};
        var parameterList = $.isArray(options.parameter) ? options.parameter :
                            typeof options.parameter == 'string' ?  options.parameter.split(' ') :
                            [options.parameter];

//HER        function addParameter(

        $.each(parameterList, function(index, parameterOptions){
            if (typeof parameterOptions == 'string')
                parameterOptions = {id: parameterOptions};

            var parameter = nsParameter.getParameter(parameterOptions.id),
                newParameter = {
                    id       : parameterOptions.id,
                    parameter: parameter,
                    unit     : nsParameter.getUnit(parameterOptions.unit || parameter.unit),
                };
            _this.parameterList.push(newParameter);
            _this.parameters[newParameter.parameter.id] = newParameter;
        });

        /*
        Station.data = [parameterId]{
            value:[]float, timestamp:[]STRING, unit: STRING
        */
        this.observationData = {};
        this.forecastData = {}
        $.each(this.parameters, function(parameterId, parameterOptions){
            _this.observationData[parameterId] = {
                value   : [],
                timestep: [],
                unit    : parameterOptions.unit.id
            };
            _this.forecastData[parameterId] = {
                value   : [],
                timestep: [],
                unit    : parameterOptions.unit.id
            };
        });



        //Adjust options.observation and options.forecast to be {STANDARD_NAME: {subDir: STRING, fileName:STRING}}
        function adjust(options, subDirId){
            if (!options) return false;
            var newOptions = options;
            if (typeof options == 'string'){
                newOptions = {};
                $.each(_this.parameters, function(parameterId){
                    newOptions[parameterId] = options;
                });
            }

            $.each(newOptions, function(parameterId, fileName){
                fileName = fileName.replace('{id}', _this.id);
                newOptions[parameterId] = {subDir: _this.location.observations.options.subDir[subDirId], fileName: fileName};
            });

            return newOptions;
        }
        this.observation = adjust(options.observation, 'observations');
        this.forecast    = adjust(options.forecast,    'forecasts'   );
    };



    nsObservations.Station.prototype = {
        addLastObservation: function(properties){
            var data = this.observationData[properties.standard_name];
            if (data && (!data.timestep.length || (data.timestep[data.timestep.length-1] != properties.timestep[0]) ) ){
                data.timestep.push( properties.timestep[0] );
                data.value.push   ( properties.value[0]    );
            };
            if (properties.units)
                data.unit = properties.units;
        },

        getData: function(parameterId, index, forecast){
            var data = (forecast ? this.forecastData : this.observationData)[parameterId];
            if (data && data.timestep && (data.timestep.length > index))
                return {
                    value   : data.value[index],
                    timestep: data.timestep[index]
                };
            else
                return null;
        },
        getAllData: function(index, forecast){
            var _this = this,
                result = {};
            $.each(this.parameters, function(parameterId){
                result[parameterId] = _this.getData(parameterId, index, forecast);
            });
            return result;
        },

        //getAllLastData: return the last data-set.
        getAllLastData: function(forecast){
            //Find max-index = max of first parameter
            var data = forecast ? this.forecastData : this.observationData,
                dataOneP = data[this.parameterList[0].parameter.id],
                maxIndex = dataOneP.timestep ? dataOneP.timestep.length-1 : -1;
            return this.getAllData(maxIndex, forecast);
        },


        //format: Return a formated string with the data. index = true => last value
        format: function(index = true, testTimestep, forecast){
            var _this = this,
                dataSet = index === true ? this.getAllLastData(forecast) : this.getAllData(index, forecast);

            //Find max timestep
            var maxTimestepValue = 0;
            $.each(dataSet, function(parameterId, valueTimestepUnit){
                if (valueTimestepUnit.timestep)
                    maxTimestepValue = Math.max(maxTimestepValue, moment(valueTimestepUnit.timestep).valueOf());
            });



            //Count valid data and find unit to convert to (if any)
            var toUnit = nsParameter.getUnit(this.observationGroup.options.formatUnit),
                parameterDataOk = 0;

            $.each(dataSet, function(parameterId, valueTimestepUnit){
                //Check if there are data and if the timestep is the same
                if (valueTimestepUnit.timestep){
                    if (moment(valueTimestepUnit.timestep) == maxTimestepValue)
                        parameterDataOk++;
                    else
                        valueTimestepUnit.timestep = null;

                    //Check and find unit to convert to (if any)
                    var fromUnit = valueTimestepUnit.unit = (forecast ? _this.forecastData : _this.observationData)[parameterId].unit || _this.parameters[parameterId].unit;
                    fromUnit = nsParameter.getUnit(fromUnit);

                    if ( toUnit &&
                         (toUnit.id != fromUnit.id)  && //Not same unit, AND
                         ( (toUnit.SI_unit && fromUnit.SI_unit && (toUnit.SI_unit == fromUnit.SI_unit)) || //Both units have same SI-unit, OR
                           ((toUnit.SI_unit == fromUnit.id) || (toUnit.id == fromUnit.SI_unit))            //One of the units are the other unit's SI-unit
                         )
                       )
                        valueTimestepUnit.toUnit = toUnit;
                }
            });

            //If all dataSet for all parameters are ok OR enough dataset are ok => format values
            if ( (parameterDataOk == this.parameterList.length) ||
                 (!this.observationGroup.options.allNeeded && (parameterDataOk > 0))
               )
                return this.observationGroup.format(dataSet, this);
            else
                return '?';
        }

/*
        _chartUrl: function(){
            return  (window.location.protocol == 'https:' ? 'https:' : 'http:') +
                    '//chart.fcoo.dk/station_timeseries.asp?' +
                        'LANG=' + (window.i18next.language.toUpperCase() == 'DA' ? 'DA' : 'ENG') + '&' +
                        'USER=DEFAULT&' +
                        'PARAMID=SeaLvl&' +
                        'WIDTH=' + imgWidth + '&' +
                        'HEIGHT=' + imgHeight + '&' +
                        'FORECASTMODE=' + (this.location.options.hasForecast ? '1' : '0') + '&' +
                        'AUTOSCALE=1&'+
                        'HEADER=0&' +
                        'NOLOGO=1&' +
                        'MODE=0&' +
                        'INFOBOX=1&' +
                        'FORECASTPERIOD=48&' +
                        'HINDCASTPERIOD=24&' +
                        'MODE=popup&' +
                        'ID=SEALVL_' + this.options.id;
        },

        createPopupContent: function( popupEvent ){
            popupEvent.popup.changeContent(
                $('<img/>')
                    .attr('src', this._chartUrl())
                    .css({width: imgWidth, height: imgHeight })
            );
        }
*/
    };


}(jQuery, this.i18next, this.moment, this, document));


