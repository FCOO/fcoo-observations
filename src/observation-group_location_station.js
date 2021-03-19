/****************************************************************************
observation-group_location_station.js

ObservationGroup = group of Locations with the same parameter(-group)
Location = group of Stations with the same or different paramtre
Station  = Single measurement-station with one or more parametre.
Only one station pro Location is active within the same ObservationGroup

****************************************************************************/
(function ($, L, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    /*****************************************************
    ObservationGroup
    Represent a set of locations with have the same parameter or parameter-group

    The "icon" is added to each Locations' marker on the map to indicated witch group
    the location contains.

    *****************************************************/
    nsObservations.observationGroupData = [{
            "id"            : "METEOGRAM",
            "name"          : {"da": "Meteogram", "en": "Meteogram"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-skyblue  obs-grp-icon obs-grp-icon-top",
            "parameterId"   : "",
            "parameterGroup": ""
        },{
            "id"            : "WIND",
            "name"          : {"da": "Vind", "en": "Wind"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-gray      obs-grp-icon obs-grp-icon-over",
            "parameterId"   : "",
            "parameterGroup": "XXWIND"
        },{
            "id"            : "WAVE",
            "name"          : {"da": "Bølger", "en": "Waves"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-gray      obs-grp-icon",
            "parameterId"   : "",
            "parameterGroup": "WAVE"
        },{
            "id"            : "SEALEVEL",
            "name"          : {"da": "Vandstand", "en": "Sea Level"},
            "icon"          : "fas fa-horizontal-rule _fa-lbm-color-white    obs-grp-icon  obs-grp-icon-center fa-rotate-90",
            "parameterId"   : "",
            "parameterGroup": "SEALEVEL"
        },{
            "id"            : "CURRENT",
            "name"          : {"da": "Strøm", "en": "Current"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-gray      obs-grp-icon obs-grp-icon-below",
            "parameterId"   : "",
            "parameterGroup": "CURRENT"
        },{
            "id"            : "HYDRO",
            "name"          : {"da": "MANGLER - Temp og salt mv.", "en": "TODO"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-seagreen obs-grp-icon obs-grp-icon-bottom",
            "parameterId"   : "",
            "parameterGroup": ""
        }];

    nsObservations.ObservationGroup = function(options, observations){
        this.options = options;
        this.id = options.id;

        this.observations = observations;
        this.locationList = [];
        this.locations = {};

        this.visibleOnMap = {}; //visibleOnMap[map._leaflet_id] true/false

        //Måske
        this.activeStationList = [];
        this.activeStations    = {};
    };


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
            }
            return false;
        },

        //show(mapOrMapId) Show the locations in the group on the map
        show: function(mapOrMapId){
            return this.toggle(mapOrMapId, true);
        },

        //hide(mapOrMapId) Hide the locations in the group on the map
        hide: function(mapOrMapId){
            return this.toggle(mapOrMapId, false);
        },

        //toogle(mapOrMapId, show) Show/Hide the locations in the group on the map
        toggle: function(mapOrMapId, show){
            var className  = 'observation-group-'+this.options.index,
                mapId      = typeof mapOrMapId == 'string' ? mapOrMapId : nsObservations.getMapId(mapOrMapId),
                map        = this.observations.maps[mapId],
                $container = map ? $(map.getContainer()) : null;

            if ($container){
                if (show == undefined)
                    show = !$container.hasClass(className);
                $container.toggleClass(className, show);
            }
            return this;
        },

//HER        //isVisibleOnMap return true if this is visible on the Map mapId
//HER        isVisibleOnMap: function(mapId){
//HER            return true; //this.id == 'WIND';
//HER        }
    };



    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/
    var bsMarkerOptions = {
            size       : 'small',
            //size       : 'normal',
            colorName  : 'orange',
            round      : false,

            scaleInner      : 150,
            markerClassName : 'overflow-hidden obs-grp-marker',

            transparent: true,

            hover      : true,
            tooltipHideWhenPopupOpen: true
        },
        imgWidth  = 600,
        imgHeight = 340; //Original = 400;

    nsObservations.Location = function(options){
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
        /*********************************************
        appendStations
        *********************************************/
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

        },

        /*********************************************
        createMarker
        *********************************************/
        createMarker: function(/*mapId*/){
            var markerOptions = $.extend(true, {}, bsMarkerOptions);

            markerOptions.innerIconClass = [];
            $.each(this.observationGroupList, function(index, observationGroup){
                var ogIndex = observationGroup.options.index;
                markerOptions.innerIconClass.push(observationGroup.options.icon+' obs-grp-icon-'+ogIndex);
                markerOptions.markerClassName += ' obs-grp-marker-'+ogIndex;
            });

            return L.bsMarkerCircle( this.latLng, markerOptions)
                       .bindTooltip(this.options.name);
        },

        /*********************************************
        addPopup
        *********************************************/
        addPopup: function(mapId, marker){

if (!this.$test){
    this.$test = $('<div/>').css('text-align', 'center');
    //this.$test2 = $('<div/>').css('text-align', 'center');
    var _this = this;
    window.setInterval(function(){
        var val = Math.round(Math.random()*10000);
        if (_this.$test)
            _this.$test.text(val );
        if (_this.$test2)
            _this.$test2.text(val );
    }, 1000);
}

            marker.bindPopup({
                //width  : 15 + imgWidth + 15,
                //width  : 15 + imgWidth + 15,
 width  : 200,
//flexWidth: true,
                fixable: true,
                scroll : 'horizontal',
                header : {
                    icon: L.bsMarkerAsIcon(bsMarkerOptions.colorName, null, {faClassName:'fa-square'}),
//                    text: [{da: 'Vandstand -', en: 'Sea level -'}, this.options.name]
                    text: this.options.name
                },
                //Add 'dummy' content to get popup dimentions correct on first open
                content: $('<div/>').css({width: imgWidth, height: imgHeight})
            });
            marker.on('popupopen', this.createPopupContent, this );
        },


        /*********************************************
        createPopupContent
        *********************************************/
        createPopupContent: function( popupEvent ){
            popupEvent.popup.changeContent({
                noVerticalPadding:  true,
//                noHorizontalPadding: true,
minimized: {
    width: 50, center: true,

showHeaderOnClick: true,

//    content: {type:'textbox', text:'12&nbsp;m/s&nbsp;NNW', center: true},
    content: this.$test,//'Her',//$('<div/>').css('text-align', 'center').text(Math.round( 100*Math.random())),
    noVerticalPadding:  true,
    noHorizontalPadding: true,
},
isMinimized: true,
                content: [
                    {type:'textbox', text: {da: 'Vandstand', en:'Sea Level'}, center:true},
//                    {type:'select', selectedId:'no2', items: [{id:'no1', text:'Vandstand'}, {id:'no2', text: 'Noget anden'}]},

                    {type: 'text', label: {da:'Seneste måling', en:'Latest measurement'}, center: true, class:'DETTE_ER_GODT', text: ' '},

//                    this.$test2,
                    {type:'textbox', label: {da:'Prognoser', en:'Forecasts'}, text: 'Her kommer 0-6, 6-12 og 12-24 timers prognoser', center:true}
                ],
                extended: {
                    width: 300,
                    content: 'Ext'
                }
            });

            this.$test2 = popupEvent.popup.bsModal.$body.find('.input-group.DETTE_ER_GODT div.container-icon-and-text span');


//HER'HER KOMMER DER EN GRAF OG NOGET ANDET...');
            //this.activeStation.createPopupContent(popupEvent);
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
                };
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
                newOptions[parameterId] = {subDir: _this.location.observations.options.subDir[subDirId], fileName: fileName};
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



