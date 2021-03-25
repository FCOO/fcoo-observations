/****************************************************************************
observation-group.js

ObservationGroup = group of Locations with the same parameter(-group)
****************************************************************************/
(function ($, L, window, document, undefined) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
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
    nsObservations.observationGroupData = [{
            "id"            : "METEOGRAM",
            "name"          : {"da": "Meteogram", "en": "Meteogram"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-skyblue  obs-grp-icon obs-grp-icon-top",
            "parameterId"   : "",
            "parameterGroup": "TODO",
            "allNeeded"     : false
        },{
            "id"            : "WIND",
            "name"          : {"da": "Vind", "en": "Wind"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-gray      obs-grp-icon obs-grp-icon-over",
            "parameterId"   : "",
            "parameterGroup": "WIND",
            "directionFrom" : true,
            "formatMethod"  : "formatWind",
            "allNeeded"     : false
        },{
            "id"            : "WAVE",
            "name"          : {"da": "Bølger", "en": "Waves"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-gray      obs-grp-icon",
            "parameterId"   : "",
            "parameterGroup": "WAVE",
            "formatMethod"  : "formatWave",
            "allNeeded"     : false
        },{
            "id"            : "SEALEVEL",
            "name"          : {"da": "Vandstand", "en": "Sea Level"},
            "icon"          : "fas fa-horizontal-rule _fa-lbm-color-white    obs-grp-icon  obs-grp-icon-center fa-rotate-90",
            "parameterId"   : "",
            "parameterGroup": "SEALEVEL",
            "formatMethod"  : "formatSeaLevel",
            "allNeeded"     : true,
            "formatUnit"    : "cm"
        },{
            "id"            : "CURRENT",
            "name"          : {"da": "Strøm", "en": "Current"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-gray      obs-grp-icon obs-grp-icon-below",
            "parameterId"   : "",
            "parameterGroup": "CURRENT",
            "formatMethod"  : "formatCurrent",
            "allNeeded"     : true
        },{
            "id"            : "HYDRO",
            "name"          : {"da": "MANGLER - Temp og salt mv.", "en": "TODO"},
            "icon"          : "fas fa-horizontal-rule fa-lbm-color-seagreen obs-grp-icon obs-grp-icon-bottom",
            "parameterId"   : "",
            "parameterGroup": "",
            "formatMethod"  : "TODO",
            "allNeeded"     : false
        }];

    nsObservations.ObservationGroup = function(options, observations){
        this.options = options;
        this.id = options.id;

        this.observations = observations;
        this.locationList = [];
        this.locations = {};

        //Set the format-method
        this.format = options.formatMethod && this[options.formatMethod] ? this[options.formatMethod] : this.defaultFormat;
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


        /*********************************************
        _getMapOptions(mapOrMapId)
        Return the coresponding record in ns.FCOOObservations.maps =
        {map, $container, geoJSONLayer, dataAdded}
        *********************************************/
        _getMapOptions: function(mapOrMapId){
            var mapId = typeof mapOrMapId == 'string' ? mapOrMapId : nsObservations.getMapId(mapOrMapId);
            return this.observations.maps[mapId];
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
            var className  = 'observation-group-'+this.options.index,
                mapId      = typeof mapOrMapId == 'string' ? mapOrMapId : nsObservations.getMapId(mapOrMapId),
                mapOptions = this._getMapOptions(mapOrMapId),
                $container = mapOptions.$container;

            if ($container){
                if (show == undefined)
                    show = !this.isVisible(mapOrMapId);
                $container.toggleClass(className, show);
            }

            //Toggle class observation-group-multi to mark multi groups visible on the map
            var visibleGroups = 0;
            for (var i=0; i<10; i++)
                if ($container.hasClass('observation-group-'+i))
                    visibleGroups++;
            $container.toggleClass('observation-group-multi', visibleGroups > 1);

            //Update or close all open popups
            $.each(this.locations, function(id, location){
                if (location.popups[mapId])
                    if (show || location.isVisible(mapId))
                        location.createPopupContent(mapId);
                    else {
                        location.popups[mapId]._pinned = false;
                        location.popups[mapId]._close();
                    }
            });
            return this;
        },

        /*********************************************
        isVisible(mapOrMapId) - return true if this is visible on the Map mapId
        *********************************************/
        isVisible: function(mapOrMapId){
            var className  = 'observation-group-'+this.options.index,
                mapOptions = this._getMapOptions(mapOrMapId);

            return mapOptions.$container.hasClass(className);
        },

        /*********************************************
        **********************************************
        formatXX(data, station)
        Different format-methods for the different groups
        **********************************************
        *********************************************/

        //Simple display the first parameter
        defaultFormat: function(data, station){
            var parameter = station.parameterList[0].parameter;
            return parameter.format(data[parameter.id].value, true, data[parameter.id].toUnit);
        }




    };

}(jQuery, L, this, document));