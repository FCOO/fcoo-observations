/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, window/*, document, undefined*/) {
	"use strict";

	window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};



    /***************************************************************
    FCOOObservations
    ****************************************************************/
    ns.FCOOObservations = function(options){
        var _this = this;
        this.options = $.extend(true, {}, {
			VERSION         : "{VERSION}",
            subDir          : {
                observations: 'observations',
                forecasts   : 'forecasts'
            },
            groupFileName   : 'observations-groups.json',
            locationFileName: 'locations.json',
            fileName        : 'fcoo-observations.json',
        }, options || {});

        this.maps = {};

//HER        this.options.pointToLayer = $.proxy(this.pointToLayer, this);
//HER        this.options.onEachFeature = $.proxy(this.onEachFeature, this);

        this.ready = false;

        //Read observations-groups from setup-file
        this.observationGroupList = [];
        this.observationGroups = {};
        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.groupFileName}),
            resolve : function(data){
                $.each(data, function(index, options){
                    var newObservationGroup = new nsObservations.ObservationGroup(options);
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
                resolve : $.proxy(_this._resolve, _this)
            });
        });
    }

    ns.FCOOObservations.prototype = {
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

                //Assign the location to the observationsGroups it belong to
                $.each(_this.observationGroups, function(id, observationGroup){
                    if (observationGroup.checkAndAdd(nextLocation)){
                        nextLocation.observationGroups[id] = observationGroup;
                        nextLocation.observationGroupList.push(observationGroup);
                    }
                });
            });


            this.filesResolved++;
            if (this.filesResolved == this.fileNameList.length){
                this.ready = true;
                $.each(this.maps, function(id, map){
                    if (map._fcoo_observations_not_added)
                        _this._addTo(map);
                });
            }
        },

        addTo: function(map){
            this.maps[map._leaflet_id] = map;
            if (this.ready)
                this._addTo(map);
            else
                map._fcoo_observations_not_added = true;
        },

        _addTo: function(map){
            map._fcoo_observations_not_added = false;

            //Convert all active locations into a geoJSON feature-group
            var geoJSON = {
                    type    : "FeatureCollection",
                    features: []
                },
                _this = this;

            //Create all locations and add them to the geoJSON-data
            $.each(this.locations, function(locationId, location){
                if (location.active)
                    geoJSON.features.push({
                        geometry: {
                            type       : "Point",
                            coordinates: [location.latLng.lng, location.latLng.lat]
                        },
                        type      : "Feature",
                        properties: { locationId: locationId }
                    });
            });


            var geoJSONLayer = new L.GeoJSON(geoJSON);

            geoJSONLayer.addTo(map);
//            geoJSONLayer.addData( geoJSON );


//            console.log(geoJSON);
        }

    }


    /***************************************************************
    L.GeoJSON.FCOOObservations
    Extended version of L.GeoJSON used to display
    locations with observations on a map
    ****************************************************************/

/*
	//Extend base leaflet class
    L.GeoJSON.FCOOObservations = L.GeoJSON.extend({

        //Default options
		options: {
            fileName: 'fcoo-observations.json',
            subDir  : 'observations',
			VERSION : "{VERSION}"
		},

        //initialize
        initialize: function(initialize){
            return function (xx, options) {
                var _this = this,
                    result = initialize.apply(this, arguments);


                this.options.pointToLayer = $.proxy(this.pointToLayer, this);
                this.options.onEachFeature = $.proxy(this.onEachFeature, this);


console.log(this.options);
                //Read the meta-data
                $.each(this.fileNameList, function(index, fileName){
                    ns.promiseList.append({
                        fileName: {subDir: _this.options.subDir, fileName: fileName},
                        resolve : $.proxy(_this._resolve, _this)
                    });
                });

                //return result;
            };
        } (L.GeoJSON.prototype.initialize),


       //_resolve
       _resolve: function( data ){ console.log(data, this); return;
            this.list.push( data );
            //Wait for all setup-files to be read
            if (this.list.length != this.fileNameList.length)
                return;

            console.log(this.list);
return;

            var geoJSON = {
                    type    : "FeatureCollection",
                    features: []
                },
                _this = this;

            //Create all locations and add them to the geoJSON-data
            $.each(data, function(index, locationOptions ){
                var loc = new ns.Location( locationOptions );
                _this.list.push( loc );

                if (loc.options.active)
                    geoJSON.features.push({
                        geometry: {
                            type       : "Point",
                            coordinates: [loc.latLng.lat, loc.latLng.lng]
                        },
                        type      : "Feature",
                        properties: { index: _this.list.length-1 }
                    });
                locationOptions.index = _this.list.length-1;
            });

            this.addData( geoJSON );
       },

        _findLocationByFeature: function( feature, methodName, arg ){
            var loc = this.list[ feature.properties.index ];
            return loc[methodName].apply(loc, arg);
        },

        pointToLayer: function (feature) {
            return this._findLocationByFeature( feature, 'createMarker');
        },

        //onEachFeature
        onEachFeature: function (feature, layer) {
            return this._findLocationByFeature( feature, 'addPopup', [layer] );
        },
	});
*/
}(jQuery, L, this, document));



