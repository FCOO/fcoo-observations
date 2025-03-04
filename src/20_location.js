/****************************************************************************
location.js

Location = group of Stations with the same or different paramtre

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    let ns = window.fcoo = window.fcoo || {},
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

    nsObservations.Location = function( options ){
        this.options = options;
        this.id = options.id;
        this.name = ns.ajdustLangName(options.name);

        this.stationList = [];

        //observationGroups and observationGroupList = the gropup this location belongs to
        this.observationGroups = {};
        this.observationGroupList = [];

        //observationGroupStations = {observationGroup-id: Station} = ref to the Station (if any) used for the ObservationGroup
        this.observationGroupStations = {};
        this.observationGroupStationList = [];

        this.init();
    };


    nsObservations.Location.prototype = {

        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        /*****************************************************
        _getFuncList - Get an adjusted version of one of the function-lists:
        updateLastObservationFuncList, updateObservationFuncList, updateForecastFuncList
        *****************************************************/
        _getFuncList: function( listOrListName ){
            let list = typeof listOrListName == 'string' ? nsObservations[listOrListName] : listOrListName,
                result = [];
            list.forEach( (opt) => {
                let func;
                if (typeof opt == 'string')
                    func = this[opt].bind(this);
                else
                    if (typeof opt == 'function')
                        func = opt.bind(this);
                    else {
                        let method = opt.func,
                            context = opt.context || this;
                        func = (typeof method == 'string' ? context[method] : method).bind(context);
                    }
                result.push(func);
            }, this);
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
            return this._callFuncList('updateLastObservationFuncList', nsObservations.updateLastObservationFuncList);
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



