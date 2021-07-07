/****************************************************************************
observation-group.js

ObservationGroup = group of Locations with the same parameter(-group)
****************************************************************************/
(function ($, L, i18next, moment, window, document, undefined) {
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
            "icon"                  : "fas fa-horizontal-rule _fa-lbm-color-white    obs-group-icon  obs-group-icon-center fa-rotate-90",
            "parameterId"           : "sea_surface_height_above_mean_sea_level",
            "formatterMethod"       : "formatterSeaLevel",
            "allNeeded"             : true,

            "maxDelay"              : "PT1H",   //Max delay of latest measurement before it is not shown as "Last Measurement"
            "maxGap"                : 60,       //Minutes. Max gap between points before no line is drawn.
            "historyPeriod"         : "PT30H",  //Length of historical period

            "formatUnit"            : "cm",
            "minRange"              : 80,   //Min range on y-axis. Same as formatUnit or parameter default unit

        },
/*
        {
            "id"                    : "METEOGRAM",
            "name"                  : {"da": "Meteogram", "en": "Meteogram"},
            "icon"                  : "fas fa-horizontal-rule fa-lbm-color-skyblue  obs-group-icon obs-group-icon-top",
            "parameterId"           : "",
            "allNeeded"             : false
        },
*/
/*
        {
            "id"                    : "WIND",
            "name"                  : {"da": "Vind", "en": "Wind"},
            "icon"                  : "fas fa-horizontal-rule fa-lbm-color-gray      obs-group-icon obs-group-icon-over",
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
            "name"                  : {"da": "Bølger", "en": "Waves"},
            "icon"                  : "fas fa-horizontal-rule fa-lbm-color-gray      obs-group-icon",
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
            "icon"                  : "fas fa-horizontal-rule fa-lbm-color-gray      obs-group-icon obs-group-icon-below",
            "parameterId"           : "sea_water_velocity",
            "formatterMethod"       : "formatterVectorDefault",
            "formatterStatMethod"   : "formatterStatVectorDefault",
            "allNeeded"             : true,

            "maxDelay"              : "PT1H",   //Max delay of latest measurement before it is not shown as "Last Measurement"
            "maxGap"                : 60,       //Minutes. Max gap between points before no line is drawn.

            "minRange"              : 1, //Min range on y-axis. Same as formatUnit or parameter default unit

            "arrow"                 : "fas-long-arrow-alt-up.svg", //"fal-long-arrow-alt-up.svg",
            "arrowHeight"           : 16,
            "arrowWidth"            :  8

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

        this.maxDelayValueOf = moment.duration(this.options.maxDelay).valueOf();
        this.observations = observations;
        this.locationList = [];
        this.locations = {};

        this.parameterList = $.isArray(options.parameterId) ? options.parameterId : options.parameterId.split(' ');
        this.primaryParameter = nsParameter.getParameter(this.parameterList[0]);

        this.directionArrow = {
            dir   : 'images/',
            src   : options.arrow || 'fas-arrow-up.svg',
            width : options.arrowWidth || 16,
            height: options.arrowHeight || 16,
        };

        //Find header = name [unit] used by primary-parameter
        var primaryUnit = nsParameter.getUnit(this.options.formatUnit || this.primaryParameter.unit);
        this.header = {};
        $.each(i18next.options.languages || i18next.languages, function(index, lang){
            _this.header[lang] = (_this.name[lang] || _this.name['en']) + ' [' + (primaryUnit.name[lang] ||  primaryUnit.name['en']) + ']';
        });
    };


    nsObservations.ObservationGroup.prototype = {
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
//HER var start = moment().valueOf();
//HER console.log('START');
            //Open all not-open location within the maps current bounds
            $.each(this.locations, function(id, location){
                if (mapBounds.contains(location.latLng) && location.markers[mapId]){
                    location.openPopupAsNormal = false;
                    location.markers[mapId].openPopup();
                    location.popups[mapId]._setPinned(true);
                    location.openPopupAsNormal = true;
                }
            });

//HER console.log('END ', moment().valueOf() - start );
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



//HER            return this._getMapOptions(mapOrMapId).$container.hasClass('obs-group-'+this.options.index);
        },
    };

}(jQuery, L, this.i18next, this.moment, this, document));