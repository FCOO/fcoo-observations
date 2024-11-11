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
    Represent a location with one or more 'stations'
    *****************************************************/

    /*
    To allow different "systems" using the same FCOOObservations
    there are three global lists of "functions" under nsObservations that are being used:

    updateLastObservationFuncList
    updateObservationFuncList
    updateForecastFuncList

    The three list contains of
        1: Function, or
        2: {func: Function or String (method-name for context), context: Object (default = this (Location))}, or
        3: String (method-name for Location) => 2:
    */

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
        _getFuncList - Get an adjusted version of one of the function-lists:
        updateLastObservationFuncList, updateObservationFuncList, updateForecastFuncList
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

        _callFuncList: function( listOrListName, arg = []){
            this._getFuncList( listOrListName ).forEach( (func) => {
                func.apply(null, arg);
            });
            return this;
        },


        /*****************************************************
        loadObservation
        Load observation for all stations and parameter (if any) and update observationDataList and call location.updateObservation()
        NOTE: The data is only loaded ONCE since loading last observation will update observationDataList
        *****************************************************/
        loadObservation: function(){
            if (this.observationIsLoaded)
                this.updateObservation();
            else {
                this.observationIsLoaded = true;

                let stationUrls = {};
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    let promiseOptions = {
                            resolve: function(data) { station._resolveObservations(data, observationGroupId); },
                            reject: function(error){ station._rejectObservations(error, observationGroupId); },
                            noCache   : true,
                            retries   : 3,
                            retryDelay: 2*1000,
                            useDefaultErrorHandler: false
                        };

                    $.each(station.observation, function(parameterId, fileName){
                        let url = ns.dataFilePath(fileName);
                        if (stationUrls[url])
                            return;
                        stationUrls[url] = true;

                        Promise.getJSON(url, promiseOptions);
                    });
                });

            }
        },

        /*****************************************************
        loadForecast
        Load forecast for all stations and parameter (if any) and update forecastDataList and call location.updateForecast()
        *****************************************************/
        loadForecast: function(){
            if (this.forecastIsLoaded)
                this.updateForecast();
            else {
                this.forecastIsLoaded = true;

                //Load forecast for all parametre, but only once for each file/url
                let stationUrls = {};
                $.each(this.observationGroupStations, function(observationGroupId, station){
                    let resolve = function(data) { station._resolveForecast(data,  observationGroupId); },
                        reject  = function(error){ station._rejectForecast (error, observationGroupId); };

                    $.each(station.forecast, function(parameterId, fileName){
                        let url = ns.dataFilePath(fileName);
                        if (stationUrls[url])
                            return;
                        stationUrls[url] = true;

                        window.intervals.addInterval({
                            fileName        : fileName,
                            resolve         : resolve,
                            reject          : reject,
                            duration        : 60, //Reload every 60 min

                            useDefaultErrorHandler: false,
                            retries         : 3,
                            retryDelay      : 2*1000,
                            promiseOptions  : {noCache: true}
                        });
                    });
                });
            }
        },


        /*********************************************
        updateLastObservation
        If any of the user is using this location =>
        call all the update-methods from updateLastObservationFuncList
        *********************************************/
        updateLastObservation: function(){
            return this._callFuncList('updateLastObservationFuncList');
        },

        /*********************************************
        updateObservation
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateObservationFuncList
        *********************************************/
        updateObservation: function( onlyGroupId ){
            //Update last observation
            this.updateLastObservation();

            //Call all the update-methods from updateObservationFuncList
            return this._callFuncList('updateObservationFuncList', [onlyGroupId]);
        },

        /*********************************************
        updateForecast
        If any of the user is using this location =>
        update the observations and call all the update-methods from updateForecastFuncList
        *********************************************/
        updateForecast: function( onlyGroupId ){
             return this._callFuncList('updateForecastFuncList', [onlyGroupId]);
        },
    };

}(jQuery, this.i18next, this.moment, this, document));



