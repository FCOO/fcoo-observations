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
    nsObservations.ObservationGroup = function(options, observations){
        this.options = $.extend(true, {}, {
                directionFrom : true,//false,
                allNeeded     : true,
                maxDelay      : "PT1H",
                maxGap        : 60,
                historyPeriod : "PT30H",
                faArrow       : 'fas fa-up-long'

            }, options);
        this.id = options.id;
        this.name = options.name;
        this.shortName = options.shortName || this.name;

        this.z = options.z || '';

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
        this.shortHeader = {};
        this.tableHeader = {};
        this.tableTitle = {};
        $.each(i18next.options.languages || i18next.languages, function(index, lang){
            let name      = this.name[lang]      || this.name['en'],
                shortName = this.shortName[lang] || this.shortName['en'],
                unitName  = '[' + (primaryUnit.name[lang] ||  primaryUnit.name['en']) + ']';

            this.header[lang]      =          name      + ' '    + unitName;
            this.shortHeader[lang] =          shortName + ' '    + unitName;
            this.tableHeader[lang] = /*'<br>' +*/ shortName;// + '<br>' + unitName;
            this.tableTitle[lang]  =          shortName;

        }.bind(this));

        this.init();


    };


    nsObservations.ObservationGroup.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },


        /*********************************************
        _promise_setup: Load setup-file with stations and meta-data
        *********************************************/
        _promise_setup: function(){
            if (this.options.fileName)
                ns.promiseList.append({
                    fileName: ns.dataFilePath({subDir: this.observations.options.subDir.observations, fileName: this.options.fileName}),
                    resolve : this._resolve_setup.bind(this)
                });
        },

        /*********************************************
        _resolve_setup:
        *********************************************/
        _resolve_setup: function( options ){
            (options.locationList || options.list || []).forEach( locationOptions => {
                //Check if the location is set to be inactive
                let location = this.observations.locations[locationOptions.id];

                let defaultStationOptions =
                    $.extend(true, {}, options.default_station, {
                        level       : locationOptions.level     || undefined,
                        refLevel    : locationOptions.refLevel  || undefined,
                        owner       : locationOptions.owner     || undefined,
                        provider    : locationOptions.provider  || undefined,
                        position    : locationOptions.position  || undefined,
                        parameter   : locationOptions.parameter || locationOptions.parameterList || undefined
                });




                //Each observation-group can only have one station on each location
                let stationList = locationOptions.station || locationOptions.stationId || locationOptions.stationList;

                delete locationOptions.station;
                delete locationOptions.stationId;
                delete locationOptions.stationList;

                if (typeof stationList == 'string')
                    stationList = stationList.split(' ');
                stationList = Array.isArray(stationList) ? stationList : [stationList];

                let stationOptionsToUse = null;

                stationList.forEach( stationOptions => {
                    if (typeof stationOptions == 'string')
                        stationOptions = {id: stationOptions};

                    stationOptions = $.extend(true, {}, defaultStationOptions, locationOptions, stationOptions );
                    stationOptions.parameter = stationOptions.parameter || stationOptions.parameterList;

//HER   if (stationOptions.parameter == "sea_water_velocity_at_sea_floor")
//HER       stationOptions.parameter = "sea_water_velocity";
//"parameter"  : "sea_water_velocity_at_sea_floor",
//"parameter"  : "sea_water_velocity",

                    if (stationOptions.active === false)
                        return;

                    //Use first station or the one with prioritized = true
                    stationOptionsToUse = stationOptions.prioritized ? stationOptions : stationOptionsToUse || stationOptions;
                });


                if (stationOptionsToUse){
                    //Create a Station and connect Station, Location, and ObservationGroup (this)
                    let station = new nsObservations.Station(stationOptionsToUse, location, this);


                    //Connect location to the new station
                    location.stationList.push(station);
                    location.observationGroupStations[this.id] = station;
                    location.observationGroupStationList.push(station);

                    //Connect Location and ObservationGroup
                    if (!this.locations[location.id]){
                        this.locations[location.id] = location;
                        this.locationList.push(location);
                    }
                    if (!location.observationGroups[this.id]){
                        location.observationGroups[this.id] = this;
                        location.observationGroupList.push(this);
                        location.observationGroupList.sort( (ob1, ob2) => { return ob1.options.index - ob2.options.index; } );
                    }
                }
            }, this); //forEach( locationOptions => {...


            //Read last measurement every 3 min. Start after station-lists are loaded
            //Only in test-mode: window.intervals.options.durationUnit = 'seconds';
            let lastObservationFileName = this.options.lastObservationFileName;
            if (lastObservationFileName)
                window.intervals.addInterval({
                    duration        : 3,
                    fileName        : {mainDir: true, subDir:   this.observations.options.subDir.observations, fileName: lastObservationFileName},
                    resolve         : this._resolve_last_measurment,
                    reject          : this._reject_last_measurment,
                    context         : this,
                    useDefaultErrorHandler: false,
                    retries         : 3,
                    retryDelay      : 2*1000,
                    promiseOptions  : {noCache: true}
                });
        },










        /*****************************************************
        _resolve_last_measurment
        Split geoJSON into a {features:[]} for each station
        *****************************************************/
        _resolve_last_measurment: function(geoJSON){
            let obs = this.observations,
                stationGeoJSONs = {};

            geoJSON.features.forEach( feature => {
                let stationId = feature.properties.id,
                    stationGeoJSON = stationGeoJSONs[stationId] = stationGeoJSONs[stationId] || {features:[]};
                stationGeoJSON.features.push(feature);
            });

            //Load each geoJSON "file" into station
            $.each(stationGeoJSONs, function(findStationId, geoJSON){
                obs.locationList.forEach( location => {
                    location.stationList.forEach( station => {
                        if ((station.id == findStationId) && station.observationGroup && (station.observationGroup.id == this.id)){
                            station._resolveGeoJSON(geoJSON, false);
                            location.updateObservation();
                        }
                    });
                });
            }.bind(this));
        },

        /*****************************************************
        _reject_last_measurment
        *****************************************************/
        _reject_last_measurment: function(){
            //Update observations to hide last measurements if they get to old
            this.observations.locationList.forEach( location => location.updateObservation() );
            //return error;
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
                    //location.popups[mapId]._close();
                    location.popups[mapId].close();
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