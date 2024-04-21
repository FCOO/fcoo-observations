/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    var ns = window.fcoo = window.fcoo || {},
       //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    nsObservations.observationPeriods = [6, 12, 24]; //= The different hour-periods to display previous observation stat (min, mean, max) over. Must have length = 3
    nsObservations.forecastPeriods    = [6, 12, 24]; //= The different hour-periods to display forecast stat (min, mean, max) over. Must have length = 3

    /*
    To display stat for previous X (=observationPeriods[i]) hours of observations or Y (=forecastPeriods[i]) hours of forecast
    a minimum percent of hourly values are required. This percent is given in observation/forecast_minimumPercentValues
    */
    nsObservations.observation_minimumPercentValues = 2/3;
    nsObservations.forecast_minimumPercentValues    = 1;    //All forecast needed!

    /***************************************************************
    FCOOObservations
    ****************************************************************/
    ns.FCOOObservations = function(options){
        var _this = this;
        this.options = $.extend(true, {}, {
			VERSION         : "3.11.1",
            subDir          : {
                observations: 'observations',
                forecasts   : 'forecasts'
            },
            groupFileName           : 'observations-groups.json', //Not used at the moment
            locationFileName        : 'locations.json',
            fileName                : ['observations-sealevel.json','observations-current.json'/*, 'observations-wind.json'*/],
            lastObservationFileName : 'LastObservations_SEALVL.json LastObservations_CURRENT.json',
        }, options || {});

        this.init();

        this.ready = false;

        //Read observations-groups
        this.observationGroupList = [];
        this.observationGroups = {};
        ns.promiseList.append({
            //fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.groupFileName}),
            data    : nsObservations.observationGroupData,
            resolve : function(data){
                $.each(data, function(index, options){
                    options.index = _this.observationGroupList.length;
                    var newObservationGroup = new nsObservations.ObservationGroup(options, _this);
                    _this.observationGroupList.push(newObservationGroup);
                    _this.observationGroups[newObservationGroup.id] = newObservationGroup;
                });
            }
        });

        //Read locations
        this.locations = {};
        this.locationList = [];
        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.locationFileName}),
            resolve : function(data){
                $.each(data, function(index, options){
                    var newLocation = new nsObservations.Location(options);
                    newLocation.observations = _this;
                    _this.locationList.push(newLocation);
                    _this.locations[newLocation.id] = newLocation;
                });
            }
        });

        this.fileNameList = this.options.fileName;
        if (typeof this.fileNameList == 'string')
            this.fileNameList = this.fileNameList.split(' ');
        else
            this.fileNameList = $.isArray(this.options.fileName) ? this.options.fileName : [this.options.fileName];

        this.filesResolved = 0;

        $.each(this.fileNameList, function(index, fileName){
            ns.promiseList.append({
                fileName: ns.dataFilePath({subDir: _this.options.subDir.observations, fileName: fileName}),
                resolve : _this._resolve.bind(_this)
            });
        });

        //Read last measurement every 3 min
        var fileNameList = $.isArray(this.options.lastObservationFileName) ? this.options.lastObservationFileName : this.options.lastObservationFileName.split(' ');
        $.each(fileNameList, function(index, fileName){
            ns.promiseList.append({
                fileName: {mainDir: true, subDir: _this.options.subDir.observations, fileName: fileName}, //_this.options.lastObservationFileName},
                resolve : $.proxy(_this._resolve_last_measurment, _this),
                reload  : 3,
                promiseOptions: {noCache: true}
            });
        });
    };

    ns.FCOOObservations.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        _resolve : function(data){
            var _this = this;
            data = $.extend(true, {default_station:{}}, data);
            $.each(data.locationList || data.list, function(index, locationOptions){
                var nextLocation = _this.locations[locationOptions.id];

                //Check if the location is set to be inactive
                if (locationOptions.active === false)
                    nextLocation.active = false;

                //Append stations to location
                nextLocation.appendStations(locationOptions, data.default_station);

                //Assign the location to the observationGroups it belong to
                $.each(_this.observationGroups, function(id, observationGroup){
                    if (observationGroup.checkAndAdd(nextLocation)){
                        nextLocation.observationGroups[id] = observationGroup;
                        nextLocation.observationGroupList.push(observationGroup);
                    }
                });
                nextLocation.observationGroupList.sort(function(ob1, ob2){ return ob1.options.index - ob2.options.index; });
            });


            this.filesResolved++;
            if (this.filesResolved == this.fileNameList.length){
                //Update all Locations regarding active station etc.
                $.each(this.locations, function(locationId, location){
                    location._finally();
                });

                this.ready = true;
                this.onResolve();
            }
        },

        onResolve: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        /*****************************************************
        _resolve_last_measurment
        Split geoJSON into a {features:[]} for each station
        *****************************************************/
        _resolve_last_measurment: function(geoJSON){
            var _this = this,
                stationGeoJSONs = {};

            $.each(geoJSON.features, function(index, feature){
                var stationId = feature.properties.id,
                    stationGeoJSON = stationGeoJSONs[stationId] = stationGeoJSONs[stationId] || {features:[]};
                stationGeoJSON.features.push(feature);
            });

            //Load each geoJSON "file" into station
            $.each(stationGeoJSONs, function(findStationId, geoJSON){
                $.each(_this.locations, function(locationId, location){
                    $.each(location.stations, function(stationId, station){
                        if (stationId == findStationId){
                            station._resolveGeoJSON(geoJSON, false);
                            location.callUpdateObservation = true;
                        }
                    });
                });
            });
            $.each(_this.locations, function(locationId, location){
                if (location.callUpdateObservation){
                    location.updateObservation();
                    location.callUpdateObservation = false;
                }
            });
        }
    };
}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
location.js

Location = group of Stations with the same or different paramtre

****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/

    /*
    To allow different "systems" using the same FCOOObservations
    there are four global lists of "functions" under nsObservations that are being used:

    isActiveFuncList
    updateLastObservationFuncList
    updateObservationFuncList
    updateForecastFuncList

    The four list contains of
        1: Function, or
        2: {func: Function or String (method-name for context), context: Object (default = this (Location))}, or
        3: String (method-name for Location) => 2:
    */

    nsObservations.isActiveFuncList = [];
    nsObservations.updateLastObservationFuncList  = [];
    nsObservations.updateObservationFuncList  = [];
    nsObservations.updateForecastFuncList  = [];

    nsObservations.imgWidth  = 500; //250; //600;
    nsObservations.imgHeight = 340; //Original = 400;

    nsObservations.Location = function(options){
        options = this.options = $.extend(true, {}, {active: true}, options);

        this.id = options.id;
        this.active = options.active;

        this.name = ns.ajdustLangName(options.name);

        this.stationList = [];
        this.stations = {};

        //observationGroups and observationGroupList = the gropup this location belongs to
        this.observationGroups = {};
        this.observationGroupList = [];

        //observationGroupStations = {observationGroup-id: Station} = ref to the active/prioritized Station (if any) used for the ObservationGroup
        this.observationGroupStations = {};
        this.observationGroupStationList = [];

        this.init();
    };


    nsObservations.Location.prototype = {

        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        /*********************************************
        getHeader
        *********************************************/
        getHeader: function(){
            return {
                icon: this.observationGroupList[0].faIconPopup,
                text: this.name
            };
        },

        /*********************************************
        createSVG
        *********************************************/
        createSVG: function(svgOptions){
            var _this = svgOptions.marker.options._this,
                dim   = svgOptions.width,
                dim2  = Math.floor( dim / 2),
                dim3  = Math.floor( dim / 3),
                dim4  = Math.floor( dim / 4),
                iconOptions, pos;

            svgOptions.draw.attr({'shape-rendering': "crispEdges"});

            $.each(_this.observationGroupList, function(index, observationGroup){
                /*
                For each observationGroup the location is part of => draw a vertical or horizontal line
                iconOptions = {
                    vertical: [BOOLEAN]
                    position: vertical = true : 'left', 'beside-left', 'middle', 'beside-right', or 'right'
                              vertical = false: 'top', ' over',        'center', 'below',        or 'bottom'
                */
                iconOptions = observationGroup.options.iconOptions;
                switch (iconOptions.position){
                    case 'left'         : case 'top'   :  pos = dim4;        break;
                    case 'beside-left'  : case 'over'  :  pos = dim3;        break;
                    case 'middle'       : case 'center':  pos = dim2;        break;
                    case 'beside-right' : case 'below' :  pos = dim2 + dim4; break;
                    case 'right'        : case 'bottom':  pos = dim2 + dim3; break;
                    default                            :  pos = dim2;
                }

                svgOptions.draw
                    .line(
                        iconOptions.vertical ? pos : 0,
                        iconOptions.vertical ? 0   : pos,
                        iconOptions.vertical ? pos : dim,
                        iconOptions.vertical ? dim : pos
                    )
                    .stroke({
                        color: svgOptions.borderColor,
                        width: 1
                    })
                    .addClass('obs-group-marker-'+observationGroup.options.index);
            });
        },

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

            delete opt.station;
            delete opt.stationId;
            delete opt.stationList;

            if (typeof stationList == 'string')
                stationList = stationList.split(' ');
            stationList = $.isArray(stationList) ? stationList : [stationList];

            var hasActiveStation = false;
            $.each(stationList, function(index, stationOptions){
                if (typeof stationOptions == 'string')
                    stationOptions = {id: stationOptions};

                stationOptions = $.extend(true, {}, defaultStationOptions, opt, stationOptions );
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
        _finally - Called when all meta-data is loaded
        *********************************************/
        _finally: function(){
            var _this = this,
                wasActive = this.active;

            this.active = false;

            //For each ObservationGroup: Find the active station = The Station with options.prioritized = true OR the first "active" Station in the list (options.active = true)
            $.each(this.observationGroups, function(observationGroupId, observationGroup){
                var activeStation = null;
                $.each(_this.stationList, function(index, station){
                    if (station.options.active)
                        $.each(station.parameters, function(parameterId){
                            if (parameterId == observationGroup.primaryParameter.id)
                                //The station is active and have parameter from observationGroup. If it is prioritized or the first station
                                activeStation = station.options.prioritized ? station : (activeStation || station);
                        });
                });

                if (activeStation){
                    _this.active = wasActive;
                    _this.observationGroupStations[observationGroupId] = activeStation;
                    _this.observationGroupStationList.push(activeStation);

                    activeStation.addToObservationGroup(observationGroup);
                }
            });
        },


        /*****************************************************
        loadObservation
        Load observation for all stations and parameter (if any) and update observationDataList and call location.updateObservation()
        NOTE: The data is only loaded ONCE since loading last observation will update observationDataList
        *****************************************************/
        loadObservation: function(){
            var _this = this;
            if (this.observationIsLoaded)
                this.updateObservation();
            else {
                var resolve = $.proxy(this._resolveObservation, this),
                    promiseList = [];

                this.observationPromiseIndex = [];
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    $.each(station.observation, function(parameterId, fileName){
                        _this.observationPromiseIndex.push(station);
                        promiseList.push(
                            window.Promise.getJSON(
                                ns.dataFilePath(fileName),
                                {noCache: true, useDefaultErrorHandler: false}
                            )
                        );
                    });
                });

                window.Promise.each(promiseList, resolve)
                    .then( $.proxy(this.updateObservation, this) );

                this.observationIsLoaded = true;
            }
        },

        /*****************************************************
        _resolveObservation - resole observation pro station
        *****************************************************/
        _resolveObservation: function(data, promiseIndex){
            this.observationPromiseIndex[promiseIndex]._resolveObservations(data);
        },


        /*****************************************************
        _getFuncList - Get an adjusted version of one of the function-lists:
        isActiveFuncList, updateLastObservationFuncList, updateObservationFuncList, updateForecastFuncList
        *****************************************************/
        _getFuncList: function( listOrListName ){
            let _this = this,
                list = typeof listOrListName == 'string' ? nsObservations[listOrListName] : listOrListName,
                result = [];
            list.forEach( (opt) => {
                let func;
                if (typeof opt == 'string')
                    func = _this[opt].bind(_this);
                else
                    if (typeof opt == 'function')
                        func = opt.bind(_this);
                    else {
                        let method = opt.func,
                            context = opt.context || _this;
                        func = (typeof method == 'string' ? context[method] : method).bind(context);
                    }
                result.push(func);
            });
            return result;
        },


        /*****************************************************
        isActive - Return true if any of the 'user' is active for the location
        That means if any given methods in isActiveFuncList return true
        *****************************************************/
        isActive: function(){
            let result = false;

            this._getFuncList('isActiveFuncList').forEach( (func) => {
                result = result || func();
            });
            return result;
        },


        /*****************************************************
        loadForecast
        Load forecast for all stations and parameter (if any) and update forecastDataList and call location.updateForecast()
        The load is controlled by a 'dummy' Interval that check if new data are needed
        *****************************************************/
        loadForecast: function(){
            if (this.forecastIsLoaded)
                this.updateForecast();
            else
                if (this.interval)
                    this._loadForecast();
                else
                    this.interval = window.intervals.addInterval({
                        data    : {},
                        duration: 60, //Reload every 60 min
                        resolve : $.proxy(this._loadForecast, this),
                        wait    : false
                    });
        },

        _loadForecast: function(){
            var _this = this;
            //If the location of the station has any data displayed at any 'user' => load
            if (this.isActive()){
                var resolve = $.proxy(this._resolveForecast, this),
                    promiseList = [];

                this.forecastPromiseIndex = [];
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    $.each(station.forecast, function(parameterId, fileName){
                        _this.forecastPromiseIndex.push(station);
                        promiseList.push(
                            window.Promise.getJSON(
                                ns.dataFilePath(fileName),
                                {noCache: true, useDefaultErrorHandler: false}
                            )
                        );
                    });
                });

                window.Promise.each(promiseList, resolve)
                    .then( $.proxy(this.updateForecast, this) );

                this.forecastIsLoaded = true;
            }
            else
                this.forecastIsLoaded = false;
        },

        /*****************************************************
        _resolveForecast - resole forecast pro station
        *****************************************************/
        _resolveForecast: function(data, promiseIndex){
            this.forecastPromiseIndex[promiseIndex]._resolveForecast(data);
        },


        /*********************************************
        updateLastObservation
        If any of the user is using this location =>
        call all the update-methods from updateLastObservationFuncList
        *********************************************/
        updateLastObservation: function(){
            if (this.isActive())
                this._getFuncList('updateLastObservationFuncList').forEach( (func) => {
                    func();
                });

            return this;
        },

        /*********************************************
        updateObservation
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateObservationFuncList
        *********************************************/
        updateObservation: function(){
            //If not active by any user => exit
            if (!this.isActive())
                return;

            //Update last observation
            this.updateLastObservation();

            //Call all the update-methods from updateObservationFuncList
            this._getFuncList('updateObservationFuncList').forEach( (func) => {
                func();
            });

            return this;
        },

        /*********************************************
        updateForecast
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateForecastFuncList
        *********************************************/
        updateForecast: function(){
            if (this.isActive())
                this._getFuncList('updateForecastFuncList').forEach( (func) => {
                    func();
                });

            return this;
        },
    };

}(jQuery, this.i18next, this.moment, this, document));




;
/****************************************************************************
location-2-highcharts.js
Methods for creating Highcharts for a Location

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";


    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {},
        nsHC           = ns.hc = ns.highcharts = ns.highcharts || {};



    /****************************************************************************
    Extend Location with methods for creating and displaying a chart
    ****************************************************************************/
    $.extend(nsObservations.Location.prototype, {

        createCharts: function($container, inModal, mapOrMapId){
            var timeSeriesOptions = {
                    container: $container,
                    location : this.name,
                    parameter: [],
                    unit     : [],
                    series   : [],
                    yAxis    : [],
                    zeroLine : true
                };

            $.each(this.observationGroupStationList, function(index, station){
                var stationChartsOptions = station.getChartsOptions(mapOrMapId, inModal);
                $.each(['parameter', 'unit', 'series', 'yAxis'], function(index, id){
                    timeSeriesOptions[id].push( stationChartsOptions[id] );
                });
           });

           timeSeriesOptions.chartOptions = $.extend(true, timeSeriesOptions.chartOptions,
                inModal ? {

                } : {
                    chart: {
                        scrollablePlotArea: {
                            minWidth       : 2 * nsObservations.imgWidth,
                            scrollPositionX: 1
                        },

                        container: {
                            css: {
                                width : nsObservations.imgWidth +'px',
                                //height: nsObservations.imgHeight+'px',
                            }
                        }
                    }
                });


            nsHC.timeSeries(timeSeriesOptions);
        }
    });



}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
observation-group.js

ObservationGroup = group of Locations with the same parameter(-group)
****************************************************************************/
(function ($, i18next, moment, window, document, undefined) {
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

    Each group has a method to format a set of parameter and there values to a single text.
    "Wind" using wind-speed, wind-direction ad gust-speed to form something a la "12 (14) m/s NNW"
    "SEALEVEL" forms sea-level as "1.3 m"
    *****************************************************/
    nsObservations.observationGroupData = [
        {
            "id"                    : "SEALEVEL",
            "name"                  : {"da": "Vandstand", "en": "Sea Level"},
            "iconOptions": {
                "vertical": true,
                "position": "middle"
            },


            "parameterId"           : "sea_surface_height_above_mean_sea_level",
            "formatterMethod"       : "formatterSeaLevel",
            "allNeeded"             : true,

            "maxDelay"              : "PT1H",   //Max delay of latest measurement before it is not shown as "Last Measurement"
            "maxGap"                : 60,       //Minutes. Max gap between points before no line is drawn.
            "historyPeriod"         : "PT54H",  //Length of historical period

            "formatUnit"            : "cm",
            "minRange"              : 80,   //Min range on y-axis. Same as formatUnit or parameter default unit

        },
/*
        {
            "id"                    : "METEOGRAM",
            "name"                  : {"da": "Meteogram", "en": "Meteogram"},
            "iconOptions": {
            ...
            },
            "parameterId"           : "",
            "allNeeded"             : false
        },
*/
/*
        {
            "id"                    : "WIND",
            "name"                  : {"da": "Vind", "en": "Wind"},
            "iconOptions": {
            ...
            },
            "parameterId"           : "wind wind_speed_of_gust",
            "directionFrom"         : true,
            "formatterMethod"       : "formatterVectorWind",
            "formatterStatMethod"   : "formatterStatVectorWind",
            "allNeeded"             : false
        },
*/

/*
        {
            "id"                    : "WAVE",
            "iconOptions": {
            ...
            },
            "name"                  : {"da": "Bølger", "en": "Waves"},
            "parameterId"           : "",
            "formatterMethod"       : "formatterWave",
            "allNeeded"             : false
        },
*/

//*
        {
            "id"                    : "CURRENT",
            "name"                  : {"da": "Strøm (overflade)", "en": "Current (Sea Surface)"},
            "shortName"             : {"da": "Strøm", "en": "Current"},
            "iconOptions": {
                "vertical": false,
                "position": "below"
            },

            "parameterId"           : "surface_sea_water_velocity",
            "formatUnit"            : "nm h-1",

            "formatterMethod"       : "formatterVectorDefault",
            "formatterStatMethod"   : "formatterStatVectorDefault",
            "allNeeded"             : true,

            "maxDelay"              : "PT1H15M",//Max delay of latest measurement before it is not shown as "Last Measurement"
            "maxGap"                : 60,       //Minutes. Max gap between points before no line is drawn.
            "historyPeriod"         : "PT54H",  //Length of historical period

            "minRange"              : 1, //Min range on y-axis. Same as formatUnit or parameter default unit

            "arrow"                 : "far-long-arrow-alt-up",  //Previuos = "fal-long-arrow-up"
            "arrowDim"              : 20                        //Previuos = 16

        },
//*/
/*
        {
            "id"                    : "HYDRO",
            "name"                  : {"da": "MANGLER - Temp og salt mv.", "en": "TODO"},
            "icon"                  : "fas fa-horizontal-rule fa-lbm-color-seagreen obs-group-icon obs-group-icon-bottom",
            "parameterId"           : "",
            "formatterMethod"       : "TODO",
            "allNeeded"             : false
        }
//*/
    ];

    nsObservations.ObservationGroup = function(options, observations){
        var _this = this;
        this.options = $.extend(true, {}, {
                directionFrom : false,
                allNeeded     : true,
                maxDelay      : "PT1H",
                maxGap        : 60,
                historyPeriod : "PT30H"

            }, options);
        this.id = options.id;
        this.name = options.name;
        this.shortName = options.shortName || this.name;


        /*
        Create markerIcon:[STRING]
        iconOptions = {
            vertical: [BOOLEAN]
            position: vertical = true : 'left', 'beside-left', 'middle', 'beside-right', or 'right'
                      vertical = false: 'top',  'over',        'center', 'below',        or 'bottom'
        */

        this.iconClasses = 'far fa-minus' + (options.iconOptions.vertical ? ' fa-rotate-90' : '') + ' obs-group-icon obs-group-icon-' + options.iconOptions.position;

        this.markerIconBase = 'in-marker '+ this.iconClasses;
        this.markerIcon = 'fas '+ this.markerIconBase;

        this.maxDelayValueOf = moment.duration(this.options.maxDelay).valueOf();
        this.observations = observations;
        this.locationList = [];
        this.locations = {};

        this.parameterList = $.isArray(options.parameterId) ? options.parameterId : options.parameterId.split(' ');
        this.primaryParameter = nsParameter.getParameter(this.parameterList[0]);

/*
        this.directionArrow = {
            dir   : 'images/',
            src   : options.arrow || 'fas-arrow-up.svg',
            width : options.arrowWidth || 16,
            height: options.arrowHeight || 16,
        };
*/
        if (options.arrow)
            this.directionArrow = {
                id  : options.arrow,
                dim : options.arrowDim || 16
            };

        //Find header = name [unit] used by primary-parameter
        var primaryUnit = nsParameter.getUnit(this.options.formatUnit || this.primaryParameter.unit);

        this.header = {};
        $.each(i18next.options.languages || i18next.languages, function(index, lang){
            _this.header[lang] = (_this.name[lang] || _this.name['en']) + ' [' + (primaryUnit.name[lang] ||  primaryUnit.name['en']) + ']';
        });

        this.init();


    };


    nsObservations.ObservationGroup.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },


        /*********************************************
        checkAndAdd: Check if the location belong in the group
        *********************************************/
        checkAndAdd: function(location){
            //If already added => do nothing
            if (this.locations[location.id])
                return false;

            var _this = this,
                add = false;
            $.each(location.stationList, function(index, station){
                $.each(station.parameters, function(parameterId){
                    if (_this.primaryParameter.id == parameterId)
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


        /*********************************************
        _getMapOptions(mapOrMapId)
        Return the coresponding record in ns.FCOOObservations.maps =
        {map, $container, geoJSONLayer, dataAdded}
        *********************************************/
        _getMapOptions: function(mapOrMapId){
            return this.observations.maps[ nsObservations.getMapId(mapOrMapId) ];
        },

        /*********************************************
        isVisible(mapOrMapId) - return true if this is visible on the Map mapId
        *********************************************/
        isVisible: function(mapOrMapId){
            var mapOptions = this._getMapOptions(mapOrMapId),
                $container = mapOptions ? mapOptions.$container : null;

            return $container ? this._getMapOptions(mapOrMapId).$container.hasClass('obs-group-'+this.options.index) : false;
        },

        /*********************************************
        show(mapOrMapId) Show the locations in the group on the map
        *********************************************/
        show: function(mapOrMapId){
            return this.toggle(mapOrMapId, true);
        },

        /*********************************************
        hide(mapOrMapId) Hide the locations in the group on the map
        *********************************************/
        hide: function(mapOrMapId){
            return this.toggle(mapOrMapId, false);
        },

        /*********************************************
        toogle(mapOrMapId, show) Show/Hide the locations in the group on the map
        *********************************************/
        toggle: function(mapOrMapId, show){
            var className  = 'obs-group-'+this.options.index,
                mapId      = typeof mapOrMapId == 'string' ? mapOrMapId : nsObservations.getMapId(mapOrMapId),
                mapOptions = this._getMapOptions(mapOrMapId),
                $container = mapOptions ? mapOptions.$container : null;

            if ($container){
                if (show == undefined)
                    show = !this.isVisible(mapOrMapId);
                $container.modernizrToggle(className, !!show);

                //Toggle class multi-obs-group to mark multi groups visible on the map
                //Toggle class last-visible-obs-group-N to mark last/maximum group visible on the map
                var visibleGroups = 0,
                    maxVisibleGroupIndex = 0;
                for (var i=0; i<10; i++){
                    if ($container.hasClass('obs-group-'+i)){
                        visibleGroups++;
                        maxVisibleGroupIndex = i;
                    }
                    $container.modernizrOff('last-visible-obs-group-'+i);
                }
                $container.modernizrToggle('multi-obs-group', visibleGroups > 1);
                $container.modernizrOn('last-visible-obs-group-'+maxVisibleGroupIndex);
            }

            //Close all open popups with no visible observationGroup
            $.each(this.locations, function(id, location){
                if (location.popups[mapId] && !show && !location.isVisible(mapId)){
                    location.popups[mapId]._pinned = false;
                    location.popups[mapId]._close();
                }
            });

            //Update this.observations.state
            var stateId = this.id+'_'+mapId;
            this.observations.state = this.observations.state || {};
            this.observations.state[stateId] = !!show;

            return this;
        },



        /*********************************************
        openVisiblePopup(mapOrMapId)
        Open popup for all locations visible at the map
        *********************************************/
        openVisiblePopup: function(mapOrMapId){
            var mapId = nsObservations.getMapId(mapOrMapId),
                mapBounds = this._getMapOptions(mapId).map.getBounds();

            if (!this.isVisible(mapId))
                this.show(mapId);

            //Open all not-open location within the maps current bounds
            $.each(this.locations, function(id, location){
                if (mapBounds.contains(location.latLng))
                    location.popupMinimized(mapId);
            });
        },

        /*********************************************
        closeVisiblePopup(mapOrMapId)
        Close popup for all locations visible at the map
        *********************************************/
        closeVisiblePopup: function(mapOrMapId){
            var mapId = nsObservations.getMapId(mapOrMapId),
                mapBounds = this._getMapOptions(mapId).map.getBounds();

            //Close all open location within the maps current bounds
            $.each(this.locations, function(id, location){
                if (mapBounds.contains(location.latLng) && location.markers[mapId] && location.popups[mapId]){
                    location.popups[mapId]._setPinned(false);
                    location.markers[mapId].closePopup();
                }
            });
        },
    };

}(jQuery, this.i18next, this.moment, this, document));
;
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
                    if (dataSet[parameter.id] == undefined)
                        hasValueForAllParameters = false;
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
        datasetIsRealTime(dataSet)
        Return true if the timestamp of the dataset is not to old
        "To old" is given by the observationGroup
        *****************************************************/
        datasetIsRealTime: function(dataSet){
            return dataSet && (moment().valueOf() <= (moment(dataSet.timestamp).valueOf() + this.observationGroup.maxDelayValueOf));
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
        getPeriodStat(periodIndex, forecast)
        get the stat for period from/to now to/from nsObservations.observationPeriods[periodIndex]/nsObservations.forecastPeriods[periodIndex]
        Ex. getPeriodStat(1, true) will return the stat for the perion now (=0) to nsObservations.forecastPeriods[1] (default = 6);
        *****************************************************/
        getPeriodStat: function(periodIndex, forecast){
            if (forecast)
                return this.getStat(0/*fromHour*/, nsObservations.forecastPeriods[periodIndex]-1/*toHour*/, true/*forecast*/) || {};
            else
                return this.getStat(-1*nsObservations.observationPeriods[periodIndex]+1/*fromHour*/, 0/*toHour*/, false/*forecast*/ ) || {};
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

        /*****************************************************
        formatPeriodStat
        Return a formated string with the stat from getPeriodStat
        *****************************************************/
        formatPeriodStat: function(periodIndex, forecast){
            return this.formatStat( this.getPeriodStat(periodIndex, forecast), forecast );
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
        Return []{vectorParameterId, speedParameterId, directionParameterId, speedStr, speed, unitStr, speedAndUnitStr, directionStr, direction, defaultStr}
        *****************************************************/
        getVectorFormatParts: function(dataSet, forecast){
            var _this = this,
                result = [];
            $.each(this.vectorParameterList, function(index, vectorParameter){
                var speedParameterId     = vectorParameter.speed_direction[0].id,
                    directionParameter   = vectorParameter.speed_direction[1],
                    directionParameterId = directionParameter.id,
                    oneVectorResult = {
                        vectorParameterId   : vectorParameter.id,
                        speedParameterId    : speedParameterId,
                        directionParameterId: directionParameterId,

                        speedStr         : _this.formatParameter(dataSet, speedParameterId, forecast, true),
                        speed            : dataSet[speedParameterId],
                        unitStr          : _this.getDisplayUnit(speedParameterId).translate('', '', true),
                        speedAndUnitStr  : _this.formatParameter(dataSet, speedParameterId, forecast, false),

                        directionStr     : directionParameter.asText( dataSet[directionParameterId] ),
                        direction        : dataSet[directionParameterId],

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
                    if ((typeof value == 'number') && (value != properties.missing_value)){
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
                    }
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
            this._resolveGeoJSON(geoJSON, true);
        },

        /*****************************************************
        _resolveObservations
        *****************************************************/
        _resolveObservations: function(geoJSON){
            this._resolveGeoJSON(geoJSON, false);
        },




    };


}(jQuery, this.i18next, this.moment, this, document));



;
/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location is active within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    /****************************************************************************
    Extend Station with methods for creating and displaying a chart
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {

        /*****************************************************
        getChartsOptions
        *****************************************************/
        getChartsOptions: function(mapOrMapId/*, inModal*/){
            var obsGroupOptions = this.observationGroup.options,
                startTimestampValue = moment().valueOf() - moment.duration(obsGroupOptions.historyPeriod).valueOf(),
                parameter           = this.primaryParameter, //this.parameterList[0].parameter,
                isVector            = parameter.type == 'vector',
                scaleParameter      = isVector ? parameter.speed_direction[0] : parameter,
                obsDataList         = this.getChartDataList(parameter, false, startTimestampValue),

                defaultSeriesOptions = {
                    maxGap        : obsGroupOptions.maxGap,
                    directionArrow: isVector ? this.observationGroup.directionArrow : false
                },
                result = {
                    //parameter: parameter,
                    parameter: this.observationGroup.primaryParameter,
                    unit     : this.getDisplayUnit(scaleParameter),
                    series   : [],
                    yAxis    : {
                        minRange: obsGroupOptions.minRange,
                        min     : scaleParameter.negative ? null : 0,
                    }
                };

            //Style and data for observations
            result.series.push({
                color     : obsGroupOptions.index,
                marker    : true,
                markerSize: 2,
                visible   : this.observationGroup.isVisible(mapOrMapId),
                data      : obsDataList
            });


            if (this.forecast){
                var forecastDataList = this.getChartDataList(parameter, true),

                    firstObsTimestampValue = obsDataList.length ? obsDataList[0][0] : startTimestampValue,
                    lastObsTimestampValue  = obsDataList.length ? obsDataList[obsDataList.length-1][0] : startTimestampValue,

                    lastTimestampValueBeforeObs = 0,
                    firstTimestampValueAfterObs = Infinity;

                $.each( forecastDataList, function(index, data){
                    var timestampValue = data[0];
                    if (timestampValue < firstObsTimestampValue)
                        lastTimestampValueBeforeObs = Math.max(timestampValue, lastTimestampValueBeforeObs);
                    if (timestampValue > lastObsTimestampValue)
                        firstTimestampValueAfterObs = Math.min(timestampValue, firstTimestampValueAfterObs);
                });


                //Style and data for forecast before AND after first and last observation
                result.series.push({
                    deltaColor: +2,
                    tooltipPrefix: {da:'Prognose: ', en:'Forecast: '},
                    noTooltip : false,
                    marker    : false,
                    data      : this.getChartDataList(parameter, true, startTimestampValue, Infinity, [lastTimestampValueBeforeObs, firstTimestampValueAfterObs])
                });

                //Style and data for forecast when there are observations
                result.series.push({
                    deltaColor: +2,
                    noTooltip : true,
                    marker    : false,
                    dashStyle : 'Dash',
                    data      : this.getChartDataList(parameter, true, lastTimestampValueBeforeObs, firstTimestampValueAfterObs),
                    directionArrow: false
                });
            }

            $.each(result.series, function(index, options){
                result.series[index] = $.extend(true, {}, defaultSeriesOptions, options);
            });

            return result;
        },

        /*****************************************************
        getChartDataList
        *****************************************************/
        getChartDataList: function(parameter, forecast, minTimestepValue = 0, maxTimestepValue = Infinity, clip){
            var isVector         = parameter.type == 'vector',
                scaleParameter   = isVector ? parameter.speed_direction[0] : parameter,
                scaleParameterId = scaleParameter.id,
                dirParameterId   = isVector ? parameter.speed_direction[1].id : null,

                unit     = scaleParameter.unit,
                toUnit   = this.getDisplayUnit(scaleParameter),

                result   = [],
                dataList = forecast ? this.forecastDataList : this.observationDataList; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}

            $.each(dataList, function(index, dataSet){
                var timestepValue = moment(dataSet.timestamp).valueOf(),
                    value         = dataSet[scaleParameterId];


                if ((timestepValue >= minTimestepValue) && (timestepValue <= maxTimestepValue )){
                    //timestepValue inside min-max-range
                    var add = true;
                    if (clip){
                        //Check if timestepValue is OUTSIDE clip[0] - clip[1]
                        add = (timestepValue <= clip[0]) || (timestepValue >= clip[1]);
                    }
                    if (add){
                        value = nsParameter.convert(value, unit, toUnit);
                        result.push([
                            timestepValue,
                            isVector ? [value, dataSet[dirParameterId]] : value
                        ]);
                    }
                }
            });
            result.sort(function(timestampValue1, timestampValue2){ return timestampValue1[0] - timestampValue2[0];});
            return result;
        }

    });



}(jQuery, this.i18next, this.moment, this, document));


