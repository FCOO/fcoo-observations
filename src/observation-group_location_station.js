/****************************************************************************
observation-group_location_station.js

ObservationGroup = group of Locations with the same parameter(-group)
Location = group of Stations with the same or different paramtre
Station  = Single measurement-station with one or more parametre.
Only one station pro Location is active within the same ObservationGroup

****************************************************************************/
(function ($, L, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};



    /*****************************************************
    ObservationGroup
    Represent a set of locations with have the same parameter or parameter-group
    *****************************************************/
    nsObservations.ObservationGroup = function(options){
        this.options = options;
        this.id = options.id;
        this.locationList = [];
        this.locations = {};

        //Måske
        this.activeStationList = [];
        this.activeStations    = {};
    }


    nsObservations.ObservationGroup.prototype = {
        //checkAndAdd: Check if the location belong in the group
        checkAndAdd: function(location){
            //If already added => do nothing
            if (this.locations[location.id])
                return false;

            var _this = this,
                add = false;
            $.each(location.stationList, function(index, station){
                $.each(station.parameterList, function(index, parameter){
                    if ( (_this.options.parameterId.indexOf(parameter.parameter.id) > -1) || (_this.options.parameterGroup.indexOf(parameter.parameter.group) > -1) )
                        add = true;
                });
            });

            if (add){
                this.locationList.push(location);
                this.locations[location.id] = location;
                return true;
            };
            return false;
        }
    }



    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/
    var bsMarkerOptions = {
            size       : 'small',
            colorName  : 'orange',
            round      : true,
            transparent: true,
            hover      : true,
            tooltipHideWhenPopupOpen: true
        },
        imgWidth  = 600,
        imgHeight = 340; //Original = 400;

    nsObservations.Location = function(options, defaultStationOptions){
        options = this.options = $.extend(true, {}, {active: true}, options);

        this.id = options.id;
        this.active = options.active;
        this.latLng = options.position ? L.latLng( options.position ) : null;

        this.stationList = [];
        this.stations = {};

        //observationGroups and observationGroupList = the gropup this location belongs to
        this.observationGroups = {};
        this.observationGroupList = [];

/*
        //Check if the location has a active station
        $.each(this.stationList, function(index, stationOptions){
            var newStation = _this.stationList[index] = new nsObservations.Station( stationOptions, _this );
            if (newStation.options.active && (_this.options.active !== false)){
                _this.options.active = true;
                if (newStation.options.prioritised)
                    _this.activeStation = newStation;
                else
                    _this.activeStation = _this.activeStation || newStation;
            }
        });

        if ((!this.latLng) && this.activeStation)
            this.latLng = L.latLng( this.activeStation.options.position );
*/
    };

    nsObservations.Location.prototype = {
        appendStations: function( locationOptions, defaultStationOptions ){
            var _this = this,
                opt = locationOptions;

            //Create default station-options from location and default options
            defaultStationOptions =
                $.extend(true, {}, defaultStationOptions, {
                    level       : opt.level     || undefined,
                    refLevel    : opt.refLevel  || undefined,
                    owner       : opt.owner     || undefined,
                    provider    : opt.provider  || undefined,
                    position    : opt.position  || undefined,
                    parameter   : opt.parameter || opt.parameterList || undefined
                });

            /*  Append the station(s) related to the location.
                There are different ways to set stations:
                1: A single station can be defined using attributes:
                station or stationId: STRING = The station id
                owner    : STRING (optional)
                provider : STRING (optional)
                parameter or parameterList: NxSTRING (optional) or PARAMETER or []PARAMETER

                2: A list of station-records or station-id:
                station or stationList: []STRING or []STATION
            */

            var stationList = opt.station || opt.stationId || opt.stationList;
            if (typeof stationList == 'string')
                stationList = stationList.split(' ');
            stationList = $.isArray(stationList) ? stationList : [stationList];

            var hasActiveStation = false;
            $.each(stationList, function(index, stationOptions){
                if (typeof stationOptions == 'string')
                    stationOptions = {id: stationOptions};

                stationOptions = $.extend(true, {}, defaultStationOptions, stationOptions );
                stationOptions.parameter = stationOptions.parameter || stationOptions.parameterList;
                var newStation = new nsObservations.Station( $.extend(true, {}, defaultStationOptions, stationOptions ), _this );

                if (newStation.options.active)
                    hasActiveStation = true;
                _this.stationList.push(newStation);
                _this.stations[newStation.id] = newStation;
            });

            if (this.active && !hasActiveStation)
                this.active = false;

            if (!this.active) console.log(this);


        },













        createMarker: function(){
            this.marker =
                L.bsMarkerCircle( this.latLng, bsMarkerOptions)
                    .bindTooltip(this.options.name);
            return this.marker;
        },

        addPopup: function(marker){
            marker.bindPopup({
                width  : 15 + imgWidth + 15,
                fixable: true,
                scroll : 'horizontal',
                header : {
                    icon: L.bsMarkerAsIcon(bsMarkerOptions.colorName),
                    text: [{da: 'Vandstand -', en: 'Sea level -'}, this.options.name]
                },
                //Add 'dummy' content to get popup dimentions correct on first open
                content: $('<div/>').css({width: imgWidth, height: imgHeight})
            });
            marker.on('popupopen', this.createPopupContent, this );
        },

        createPopupContent: function( popupEvent ){
            return this.activeStation.createPopupContent(popupEvent);
        }
    };

    /*****************************************************
    Station
    Represent a station with one or more parameters
    *****************************************************/
    nsObservations.Station = function(options, location){
        var _this = this;
        this.options = options;
        this.location = location;
        this.id = options.id;

        this.parameterList = [];
        this.parameters = {};
        var parameterList = $.isArray(options.parameter) ? options.parameter :
                            typeof options.parameter == 'string' ?  options.parameter.split(' ') :
                            [options.parameter];

        $.each(parameterList, function(index, parameterOptions){
            if (typeof parameterOptions == 'string')
                parameterOptions = {id: parameterOptions};

            var parameter = nsParameter.getParameter(parameterOptions.id),
                newParameter = {
                    parameter: parameter,
                    unit     : nsParameter.getUnit(parameterOptions.unit || parameter.unit)
                }
            _this.parameterList.push(newParameter);
            _this.parameters[newParameter.parameter.id] = newParameter;
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
                newOptions[parameterId] = {subDir: _this.location.observations.options.subDir[subDirId], fileName: fileName}
            });

            return newOptions;
        }
        this.observation = adjust(options.observation, 'observations');
        this.forecast    = adjust(options.forecast,    'forecasts'   );
    };



    nsObservations.Station.prototype = {
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
    };


}(jQuery, L, this, document));



