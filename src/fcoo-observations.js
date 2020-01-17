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
    var ns = window.fcoo.observations = window.fcoo.observations || {};

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
            return function (/*options*/) {

                var result = initialize.apply(this, arguments);

                this.options.pointToLayer = $.proxy(this.pointToLayer, this);
                this.options.onEachFeature = $.proxy(this.onEachFeature, this);

                this.list = [];

                //Read the meta-data
                window.Promise.getJSON( window.fcoo.dataFilePath(this.options.subDir, this.options.fileName), {}, $.proxy(this._resolve, this) );

                return result;
            };
        } (L.GeoJSON.prototype.initialize),


       //_resolve
       _resolve: function( data ){
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

        pointToLayer: function (feature/*, latlng*/) {
            return this._findLocationByFeature( feature, 'createMarker'/*, arg*/ );
        },

        //onEachFeature
        onEachFeature: function (feature, layer) {
            return this._findLocationByFeature( feature, 'addPopup', [layer] );
        },
	});
}(jQuery, L, this, document));



