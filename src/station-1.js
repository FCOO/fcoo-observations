/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location is active within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
    "use strict";

    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    function _Math(mathMethod, value1, value2){
        var isNumbers = (isNaN(value1) ? 0 : 1) + (isNaN(value2) ? 0 : 1);
        if (isNumbers == 2) return Math[mathMethod](value1, value2);
        if (isNumbers == 0) return undefined;
        return isNaN(value1) ? value2 : value1;
    }
    function max(value1, value2){ return _Math('max', value1, value2); }
    function min(value1, value2){ return _Math('min', value1, value2); }



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
        this.vectorParameterList = [];
        this.primaryParameter = null;

        function getAsList(opt){
            return $.isArray(opt) ? opt : opt.split(' ');
        }

        //Set this.parameter = []{id:STRING, parameter:PARAMETER, unit:UNIT}
        var parameterList = getAsList(options.parameter),
            unitList      = options.unit ? getAsList(options.unit) : [];

        function addParameter(index, parameterId){
            var parameter = nsParameter.getParameter(parameterId),
                unit = index < unitList.length ? nsParameter.getUnit(unitList[index]) : parameter.unit,
                newParameter = {
                    id       : parameterId,
                    parameter: parameter,
                    unit     : unit
                };

            _this.primaryParameter = _this.primaryParameter || parameter;

            //If it is a vector => add speed- direction-, eastward-, and northward-parameter
            if (parameter.type == 'vector'){
                _this.vectorParameterList.push(parameter);
                if (parameter.speed_direction.length){
                    addParameter(index, parameter.speed_direction[0].id);
                    addParameter(99999, parameter.speed_direction[1].id);
                }
                if (parameter.eastward_northward.length){
                    addParameter(index, parameter.eastward_northward[0].id);
                    addParameter(index, parameter.eastward_northward[1].id);
                }
            }

            _this.parameterList.push(newParameter);
            _this.parameters[newParameter.parameter.id] = newParameter;
        }
        $.each(parameterList, addParameter);

        this.observationDataList = []; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}
        this.forecastDataList    = []; //                    do

        /*
        Metadata for observations and forecast = {
            PARAMETER_ID: {
                timestamp: DATE_STRING      - When was det data changed
                unit     : UNIT or UNIT_ID  - The unit the data are in
                epoch    : DATE_STRING      - Epoch of the forecast
            }
        }
        */
        this.observationMetaData = {};
        this.forecastMetaData    = {};

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
                newOptions[parameterId] = {mainDir: true, subDir: _this.location.observations.options.subDir[subDirId], fileName: fileName};
            });

            return newOptions;
        }
        this.observation = adjust(options.observation, 'observations');
        this.forecast    = adjust(options.forecast,    'forecasts'   );
    };


    nsObservations.Station.prototype = {

        /*****************************************************
        addToObservationGroup
        *****************************************************/
        addToObservationGroup: function(observationGroup){
            this.observationGroup = observationGroup;

            //Set the format- and format-stat-method
            var formatterMethod     = observationGroup.options.formatterMethod,
                formatterStatMethod = observationGroup.options.formatterStatMethod;

            this.formatter     = formatterMethod     && this[formatterMethod]     ? this[formatterMethod]     : this.formatterDefault;
            this.formatterStat = formatterStatMethod && this[formatterStatMethod] ? this[formatterStatMethod] : this.formatterStatDefault;
        },


        /*****************************************************
        getDataSet(indexOrTimestamp, forecast)
        indexOrTimestamp:
            true => last dataSet
            number => index
            string => find dataSet with same timestamp
        *****************************************************/
        getDataSet: function(indexOrTimestamp, forecast){
            var dataList = forecast ? this.forecastDataList : this.observationDataList,
                result = null;

            if (!dataList.length)
                return null;

            //indexOrTimestamp == true => last dataSet
            if (indexOrTimestamp === true)
                return dataList[dataList.length-1];

            if (typeof indexOrTimestamp == 'number')
                return indexOrTimestamp < dataList.length ? dataList[indexOrTimestamp] : null;

            //Find dataSet with timestamp == indexOrTimestamp
            $.each(dataList, function(index, dataSet){
                if (dataSet.timestamp == indexOrTimestamp){
                    result = dataSet;
                    return true;
                }
            });
            return result;
        },

        /*****************************************************
        formatDataSet
        Return a formated string with the data
        Using this.formatter that is set by this.addToObservationGroup
        *****************************************************/
        formatDataSet: function(dataSet, forecast){
            if (!dataSet)
                return '?';

            //Check if all parameters has a value in dataSet
            var hasValueForAllParameters = true;
            function checkIfValuesExists(parameterList){
                $.each(parameterList, function(index, parameter){
                    if (dataSet[parameter.id] == undefined){
                        hasValueForAllParameters = false;
                    }
                });
            }
            $.each(this.parameters, function(parameterId, parameterOptions){
                var parameter = parameterOptions.parameter;
                if (parameter.type == "vector"){
                    //Check if there are values for speed/direction/eastware/northware
                    checkIfValuesExists(parameter.speed_direction);
                    checkIfValuesExists(parameter.eastward_northward);
                }
                else
                    checkIfValuesExists([parameter]);
            });

            //If all parameter are nedded and not all have value => return '?'
            if (!this.observationGroup.options.allNeeded && !hasValueForAllParameters)
                return '?';

            return this.formatter(dataSet, forecast);
        },

        /*****************************************************
        getStat
        Calc the total stat for the given interval.
        Every hour is weighed equally
        *****************************************************/
        getStat: function(fromHour, toHour, forecast){
            var _this = this,
                stat = {},
                statList = forecast ? this.forecastStatList : this.observationStatList;

            $.each(statList, function(hourValue, hourStat){
                if ((hourValue >= fromHour) && (hourValue <= toHour)){
                    $.each(_this.parameters, function(parameterId){
                        var parameterHourStat = hourStat[parameterId];
                        if (parameterHourStat != undefined){
                            var parameterStat = stat[parameterId] = stat[parameterId] || {
                                    hours: toHour-fromHour+1,
                                    count: 0,
                                    min  : undefined,
                                    mean : 0,
                                    max  : undefined
                                };
                            parameterStat.min = min(parameterStat.min, parameterHourStat.min);
                            parameterStat.max = max(parameterStat.max, parameterHourStat.max);
                            //Mean of forecast and mean of observations is calculated as one value pro hour is used, regardless of the number of timestamps pro hour.
                            parameterStat.mean = (parameterStat.mean*parameterStat.count + parameterHourStat.mean)/(parameterStat.count+1);
                            parameterStat.count++;
                        }
                    });
                }
            });
            return stat;
        },


        /*****************************************************
        formatStat
        Return a formated string with the stat
        Using this.formatterStat that is set by this.addToObservationGroup
        *****************************************************/
        formatStat: function(stat, forecast){

            //Check that valid stat exists for alle parameters
            var statOk = true;
            function checkIfStatsExists(parameterList){
                $.each(parameterList, function(index, parameter){
                    var parameterStat = stat[parameter.id];
                    if (
                          !parameterStat ||
                          (parameterStat.count < parameterStat.hours * (forecast ? nsObservations.forecast_minimumPercentValues : nsObservations.observation_minimumPercentValues)) ||
                          (parameterStat.min == undefined) ||
                          (parameterStat.max == undefined)
                        )
                        statOk = false;
                });
            }
            $.each(this.parameters, function(parameterId, parameterOptions){
                var parameter = parameterOptions.parameter;
                if (parameter.type == "vector"){
                    checkIfStatsExists(parameter.speed_direction);
                    checkIfStatsExists(parameter.eastward_northward);
                }
                else
                    checkIfStatsExists([parameter]);
            });

            return statOk ? this.formatterStat(stat, forecast) : "?";
        },

        /**********************************************************************************************************
        **********************************************************************************************************/
        //formatter(dataSet, forecast) return a string with the value and units for the parameters in this station.
        //Is set by this.addToObservationGroup
        formatter: function(/* dataSet, forecast */){ return 'ups'; },

        //formatXX(dataSet, forecast) Different format-methods for displaying single data-set

        /*****************************************************
        formatValue(value, parameter, unit)
        Return value formatted. Convert to this.options.formatUnit if needed
        *****************************************************/
        formatValue: function(value, parameter, unit, noUnitStr = false){
            return nsParameter.getParameter(parameter).format(value, !noUnitStr, unit);
        },

        /*****************************************************
        getDisplayUnit - Return the Unit to display the parameter in
        *****************************************************/
        getDisplayUnit: function(parameter){
            var parameterUnit = nsParameter.getParameter(parameter).unit,
                displayUnit   = nsParameter.getUnit(this.observationGroup.options.formatUnit || parameterUnit);

            //If displayUnit and parameterUnit are the same physical unit => use displayUnit else use parameter default unit
            if (
                (displayUnit.SI_unit && parameterUnit.SI_unit && (displayUnit.SI_unit == parameterUnit.SI_unit)) || //Both units have same SI-unit, OR
                (displayUnit.SI_unit == parameterUnit.id) ||                                                        //One of the units are the other unit's SI-unit
                (displayUnit.id == parameterUnit.SI_unit)
               )
                return displayUnit;
            else
                return parameterUnit;
        },

        /*****************************************************
        formatParameter - Simple display parameter
        *****************************************************/
        formatParameter: function(dataSet, parameter, forecast, noUnitStr){
            parameter = nsParameter.getParameter(parameter);

            var value         = dataSet[parameter.id],
                parameterUnit = parameter.unit,
                metaData      = (forecast ? this.forecastMetaData : this.observationMetaData)[parameter.id],
                valueUnit     = nsParameter.getUnit(metaData.unit || parameterUnit);

            //If parameter unit and value unit are differnet  => convert value to parameter unit
            if (parameterUnit.id != valueUnit.id)
                value = nsParameter.convert(value, valueUnit, parameterUnit);

            return this.formatValue(value, parameter, this.getDisplayUnit(parameter), noUnitStr);

        },

        /*****************************************************
        formatterDefault - Simple display the first parameter
        *****************************************************/
        formatterDefault: function(dataSet, forecast){
            return this.formatParameter(dataSet, this.parameterList[0].parameter, forecast);
        },

        /*****************************************************
        getVectorFormatParts
        Get all parts of a vector-parameter.
        Return []{vectorParameterId, speedStr, unitStr, speedAndUnitStr, directionStr, defaultStr}
        *****************************************************/
        getVectorFormatParts: function(dataSet, forecast){
            var _this = this,
                result = [];
            $.each(this.vectorParameterList, function(index, vectorParameter){
                var speedId            = vectorParameter.speed_direction[0].id,
                    directionParameter = vectorParameter.speed_direction[1],
                    oneVectorResult = {
                        vectorParameterId: vectorParameter.id,
                        speedStr         : _this.formatParameter(dataSet, speedId, forecast, true),
                        unitStr          : _this.getDisplayUnit(speedId).translate('', '', true),
                        speedAndUnitStr  : _this.formatParameter(dataSet, speedId, forecast, false),
                        directionStr     : directionParameter.asText( dataSet[directionParameter.id] ),
                        defaultStr       : ''
                    };
                oneVectorResult.defaultStr = oneVectorResult.directionStr + ' ' + oneVectorResult.speedAndUnitStr;
                result.push(oneVectorResult);
            });
            return result;
        },

        /*****************************************************
        formatterVectorDefault - Display for the first vector-parameter
        *****************************************************/
        formatterVectorDefault: function(dataSet, forecast){
            return this.getVectorFormatParts(dataSet, forecast)[0].defaultStr;
        },

        /*****************************************************
        formatterVectorWind
        *****************************************************/
        formatterVectorWind: function(dataSet, forecast){
            var vectorPart = this.getVectorFormatParts(dataSet, forecast)[0];

            //TODO: Include wind-gust a la NNW 12 (14) m/s

            return vectorPart.defaultStr;
        },


        /*********************************************
        **********************************************
        formatterStatXX(stat, station)
        Different format-methods for the displaying statistics a single time period for different groups
        **********************************************
        *********************************************/
        //formatterStat(stat, forecast) return a string with the max, mean, min values
        //Is set by this.addObservationGroup
        formatterStat: function(/*stat, forecast*/){ return 'ups'; },



        /*****************************************************
        formatStatMinMaxMean
        *****************************************************/
        formatStatMinMaxMean: function(minStr, maxStr, meanStr, twoLines){
            return minStr + ''+ nsObservations.toChar + '' + maxStr + (twoLines ? '<br>' : ' ') + '(' + meanStr +')';
        },


        /*****************************************************
        formatStatParameter - Simple display stat for the first parameter
        *****************************************************/
        formatStatParameter: function(statId, stat, parameter, forecast, noUnitStr){
            var parameterId = nsParameter.getParameter(parameter).id,
                dataSet = {};
            dataSet[parameterId] = stat[parameterId][statId];

            return this.formatParameter(dataSet, parameter, forecast, noUnitStr);
        },


        /*****************************************************
        formatterStatDefault - Simple display stat for the first parameter
        *****************************************************/
        formatterStatDefault: function(stat, forecast){
            var parameter = this.parameterList[0].parameter;
            return this.formatStatMinMaxMean(
                this.formatStatParameter('min',  stat, parameter, forecast, true),
                this.formatStatParameter('max',  stat, parameter, forecast, true),
                this.formatStatParameter('mean', stat, parameter, forecast, true)
            );
        },

        /*****************************************************
        formatterStatVectorParameter
        Display stat for the a vector-parameter.
        Mean direction is calc from mean northward and mean eastward
        *****************************************************/
        formatterStatVectorParameter: function(stat, vectorParameter, forecast){
            var speedId       = vectorParameter.speed_direction[0].id,
                directionId   = vectorParameter.speed_direction[1].id,
                eastwardId    = vectorParameter.eastward_northward[0].id,
                eastwardMean  = stat[eastwardId].mean,
                northwardId   = vectorParameter.eastward_northward[1].id,
                northwardMean = stat[northwardId].mean;

            //Create dataSet with 'dummy' speed and mean direction
            var dataSet = {};
            dataSet[speedId]     = 1;
            dataSet[directionId] = 360 * Math.atan2(eastwardMean, northwardMean) / (2*Math.PI);

            return  this.formatStatMinMaxMean(
                        this.formatStatParameter('min',  stat, speedId, forecast, true),
                        this.formatStatParameter('max',  stat, speedId, forecast, true),
                        this.getVectorFormatParts(dataSet, forecast)[0].directionStr + ' ' + this.formatStatParameter('mean', stat, speedId, forecast, true),
                        true
                    );
        },

        /*****************************************************
        formatterStatVectorDefault
        Display stat for the first vector-parameter.
        *****************************************************/
        formatterStatVectorDefault: function(stat, forecast){
            return this.formatterStatVectorParameter(stat, this.vectorParameterList[0], forecast);
        },

        /*****************************************************
        formatteStatVectorWind - TODO
        *****************************************************/
        formatterStatVectorWind: function(stat, forecast){
            return this.formatterStatVectorDefault(stat, forecast);
        },



        /**********************************************************************************************************
        **********************************************************************************************************/

        /*****************************************************
        _resolveGeoJSON
        Convert observation or forecast from GEOJSON-file
        *****************************************************/
        _resolveGeoJSON: function(geoJSON, forecast){
            var _this    = this,
                dataList = forecast ? this.forecastDataList : this.observationDataList,
                metaData = forecast ? this.forecastMetaData : this.observationMetaData,
                features = geoJSON ? geoJSON.features : null;

            //Load new data
            $.each(features, function(index, feature){
                var properties  = feature.properties,
                    parameterId = properties.standard_name;

                //Update meta-data
                metaData[parameterId] = $.extend(metaData[parameterId] || {}, {
                    unit            : properties.units,
                    owner           : properties.owner,
                    reference_level : properties.reference_level,
                    timestamp       : geoJSON.timestamp
                });


                $.each(properties.value, function(valueIndex, value){
                    var newDataSet = {timestamp: properties.timestep[valueIndex]},
                        found      = false;
                    newDataSet[parameterId] = value;

                    //Add parameterId, value, timestamp to
                    $.each(dataList, function(index, dataSet){
                        if (dataSet.timestamp == newDataSet.timestamp){
                            dataSet = $.extend(dataSet, newDataSet);
                            found = true;
                            return true;
                        }
                    });

                    if (!found)
                        dataList.push(newDataSet);

                });

            });

            //Sort by timestamp
            dataList.sort(function(dataSet1, dataSet2){
                return dataSet1.timestamp.localeCompare(dataSet2.timestamp);
            });


            //If the station contains vector-parameter => calc speed, direction, eastware and northware for all dataSet
            if (this.vectorParameterList)
                $.each(this.vectorParameterList, function(index1, vectorParameter){
                    var speedId        = vectorParameter.speed_direction[0].id,
                        directionId    = vectorParameter.speed_direction[1].id,
                        eastwardId     = vectorParameter.eastward_northward ? vectorParameter.eastward_northward[0].id : null,
                        northwardId    = vectorParameter.eastward_northward ? vectorParameter.eastward_northward[1].id : null;

                    //Update meta-data
                    metaData[speedId]     = metaData[speedId]     || metaData[eastwardId]  || metaData[northwardId] || {};
                    metaData[northwardId] = metaData[northwardId] || metaData[eastwardId]  || metaData[speedId]     || {};
                    metaData[eastwardId]  = metaData[eastwardId]  || metaData[northwardId] || metaData[speedId]     || {};
                    metaData[directionId] = metaData[directionId] || {unit: "degree"}; //Hard-coded to degree

                    $.each(dataList, function(index2, dataSet){
                        var speedValue     = dataSet[speedId],
                            directionValue = dataSet[directionId],
                            eastwardValue  = eastwardId  ? dataSet[eastwardId]  : undefined,
                            northwardValue = northwardId ? dataSet[northwardId] : undefined;

                        if ( (eastwardValue !== undefined) && (northwardValue !== undefined)){
                            if (speedValue == undefined)
                                dataSet[speedId] = Math.sqrt(eastwardValue*eastwardValue + northwardValue*northwardValue);
                            if (directionValue == undefined)
                                dataSet[directionId] = 360 * Math.atan2(eastwardValue, northwardValue) / (2*Math.PI);
                        }
                        else
                            if ((speedValue !== undefined) && (directionValue !== undefined)){
                                var directionRad = 2*Math.PI * directionValue / 360;
                                if (eastwardValue == undefined)
                                    dataSet[eastwardId]  = Math.sin(directionRad) * speedValue;
                                if (northwardValue == undefined)
                                    dataSet[northwardId] = Math.cos(directionRad) * speedValue;
                            }
                    });
                });

            //Calculate hourly min, mean, and max in forecastStatList/observationStatList = [hour: no of hours since 1-1-1970]{parameterId: {min: FLOAT, mean: FLOAT, max: FLOAT}}
            var nowHourValue = moment().valueOf()/(60*60*1000),
                statList = this[forecast ? 'forecastStatList' : 'observationStatList'] = {};

            $.each(dataList, function(index3, dataSet){
                var hourValue = Math.ceil((moment(dataSet.timestamp).valueOf()/(60*60*1000) - nowHourValue) ),
                    hourStat = statList[hourValue] = statList[hourValue] || {};
                hourStat.hour = hourValue;

                $.each(_this.parameters, function(parameterId){
                    var parameterValue = dataSet[parameterId];
                    if (parameterValue !== undefined){
                        var parameterStat = hourStat[parameterId] = hourStat[parameterId] || {count: 0, min: undefined, mean: 0, max: undefined};
                        parameterStat.min = min(parameterStat.min, parameterValue);
                        parameterStat.max = max(parameterStat.max, parameterValue);
                        parameterStat.mean = (parameterStat.mean*parameterStat.count + parameterValue)/(parameterStat.count+1);
                        parameterStat.count++;
                    }
                });

            });
        },


        /*****************************************************
        _resolveForecast
        *****************************************************/
        _resolveForecast: function(geoJSON){
            this.forecastDataList = [];
            this._resolveGeoJSON(geoJSON, true, 2);
        },

        /*****************************************************
        _resolveObservations
        *****************************************************/
        _resolveObservations: function(geoJSON){
            this._resolveGeoJSON(geoJSON, false, 3);
        },




    };


}(jQuery, this.i18next, this.moment, this, document));


