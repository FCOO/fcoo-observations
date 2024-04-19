/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    var ns = window.fcoo = window.fcoo || {},
        //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    //nsObservations.getMapId(mapOrMapIdap) return the unique id for the map
    nsObservations.getMapId = function(mapOrMapId){
        if (mapOrMapId)
            return typeof mapOrMapId == 'string' ? mapOrMapId : ''+mapOrMapId._leaflet_id;
        else
            return null;
    };

    //Add the color-names to the list of colors for markers and polylines
    L.BsMarker._lbmAddColorName('observations');


    /***********************************************************************************
    ************************************************************************************
    Extend FCOOObservations with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    $.extend(ns.FCOOObservations.prototype, {
        _mapId: function(map){
            return nsObservations.getMapId(map);
        },

        /**********************************************************
        init
        **********************************************************/
        init: function( _init ){ return function(){
            _init.apply(this, arguments);

            this.maps = {};
            this.options.geoJSONOptions = this.options.geoJSONOptions || {};    //Extra options for the L.GeoJSON-layer
        } }(ns.FCOOObservations.prototype.init),

        /**********************************************************
        onResolve
        **********************************************************/
        onResolve: function( _onResolve ){ return function(){
            let _this = this;
            _onResolve.apply(this, arguments);

            //All data are loaded => initialize all maps and update the geoJSON-data and update any layer added before the data was ready
            this._initializeMaps();
            $.each(this.maps, function(id, options){
                if (!options.dataAdded){
                    options.geoJSONLayer.addData( _this._getGeoJSONData() );
                    options.dataAdded = true;
                }
            });
        } }(ns.FCOOObservations.prototype.onResolve),

        /**********************************************************
        _initializeMaps(map)
        **********************************************************/
        _initializeMaps: function(map){
            var _this = this,
                maps = map ? [{map:map}] : this.maps;

            $.each(maps, function(index, mapObj){
                var mapId = nsObservations.getMapId(mapObj.map);
                $.each(_this.observationGroups, function(groupId, observationGroup){
                    var stateId = groupId+'_'+mapId,
                        show = _this.state && _this.state[stateId];
                    observationGroup.toggle(mapObj.map, !!show);
                });
            });
        },

        /**********************************************************
        show(groupId, mapOrMapId)
        Show ObservationGroup with id on mapOrMapId
        **********************************************************/
        show: function(groupId, mapOrMapId){
            return this.toggle(groupId, mapOrMapId, true);
        },

        /**********************************************************
        hide(groupId, mapOrMapId)
        Hide ObservationGroup with id on mapOrMapId
        **********************************************************/
        hide: function(groupId, mapOrMapId){
            return this.toggle(groupId, mapOrMapId, false);
        },

        /**********************************************************
        toggle(groupId, mapOrMapId, show)
        Toggle ObservationGroup with id on mapOrMapId
        Save new state if ObservationGroup is not jet loaded/created
        **********************************************************/
        toggle: function(groupId, mapOrMapId, show){
            var mapId = nsObservations.getMapId(mapOrMapId),
                stateId = groupId+'_'+mapId;

            this.state = this.state || {};
            this.state[stateId] = !!show;

            if (this.observationGroups[groupId])
                this.observationGroups[groupId].toggle(mapOrMapId, show);

            return this;
        },


        /**********************************************************
        openVisiblePopup(groupId, mapOrMapId)
        Open popup for all locations visible at the map
        **********************************************************/
        openVisiblePopup: function(groupId, mapOrMapId){
            if (this.observationGroups[groupId])
                this.observationGroups[groupId].openVisiblePopup(mapOrMapId);
            return this;
        },

        /**********************************************************
        closeVisiblePopup(groupId, mapOrMapId)
        Close popup for all locations visible at the map
        **********************************************************/
        closeVisiblePopup: function(groupId, mapOrMapId){
            if (this.observationGroups[groupId])
                this.observationGroups[groupId].closeVisiblePopup(mapOrMapId);
            return this;
        },

        /**********************************************************
        geoJSON return a L.geoJSON layer
        **********************************************************/
        geoJSON: function(){
            var thisOptionsGeoJSONOptions = this.options.geoJSONOptions;
            this.geoJSONOptions =
                this.geoJSONOptions ||
                $.extend(true,
                    thisOptionsGeoJSONOptions,
                    {
                        pointToLayer : function(geoJSONPoint/*, latlng*/) {
                            return geoJSONPoint.properties.createMarker(thisOptionsGeoJSONOptions);
                        },
                    }
                );

            var result = L.geoJSON(null, this.geoJSONOptions);

            result.fcooObservation = this;
            result.options.onEachFeature = $.proxy(this._geoJSON_onEachFeature, result);

            result.on({
                add   : $.proxy(this._geoJSON_onAdd,    this),
                remove: $.proxy(this._geoJSON_onRemove, this)
            });

            return result;
        },

        //_geoJSON_onEachFeature: called with this = geoJSONLayer
        _geoJSON_onEachFeature: function(feature, marker) {
            var mapId = nsObservations.getMapId(this._map),
                location = this.fcooObservation.locations[marker.options.locationId];

            location.markers[mapId] = marker;
            feature.properties.addPopup( mapId, marker );
        },

        _geoJSON_onAdd: function(event){
            var geoJSONLayer = event.target,
                map          = geoJSONLayer._map,
                mapId        = nsObservations.getMapId(map);

            this.maps[mapId] = {
                map         : map,
                $container  : $(map.getContainer()),
                geoJSONLayer: geoJSONLayer,
                dataAdded   : this.ready
            };

            if (this.ready){
                this._initializeMaps(map);
                geoJSONLayer.addData( this._getGeoJSONData() );
            }
        },

        _geoJSON_onRemove: function(event){
            //Save selected groups (this.state) and call hide for all observationGroups to close popups and clean up.
            var state = this.state;
            this.state = {};
            var mapId = nsObservations.getMapId(event.target._map);
            delete this.maps[mapId];
            $.each(this.observationGroups, function(id, observationGroup){
                observationGroup.hide(mapId);
            });
            this.state = state;
        },

        _getGeoJSONData: function(){
            var _this = this;
            if (!this.ready)
                return null;

            if (!this.geoJSONData){
                this.geoJSONData = { type: "FeatureCollection", features: []};

                //Create all locations and add them to the geoJSON-data if they are active and included in a observation-group
                $.each(this.locations, function(locationId, location){
                    if (location.active && location.observationGroupList.length)
                        _this.geoJSONData.features.push({
                            type      : "Feature",
                            geometry  : {type: "Point", coordinates: [location.latLng.lng, location.latLng.lat]},
                            properties: location
                        });
                });
            }
            return this.geoJSONData;
        }
    }); //End of extend of FCOOObservations.prototype

    /***********************************************************************************
    ************************************************************************************
    Extend ObservationGroup with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    $.extend(nsObservations.ObservationGroup.prototype, {
        init: function( _init ){ return function(){
            _init.apply(this, arguments);

            //Create faIconPopup:[STRING] and faIcon []STRING to be used to create marker and icon in eq. bsModal
            this.faIconPopup = L.bsMarkerAsIcon('observations', null, false );
            this.faIcon = L.bsMarkerAsIcon('observations', null, false );
            this.faIcon[0].push( 'fa-lbm-border-color-black ' + this.iconClasses );

        } }(nsObservations.ObservationGroup.prototype.init),

    });

    /***********************************************************************************
    ************************************************************************************
    Extend Location with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    const bsMarkerOptions = {
            size     : 'small',
            colorName: 'observations',
            round    : false,

            markerClassName  : 'overflow-hidden',
            thinBorder       : true,
            individualContent: true,

            transparent: true,

            hover      : true,
            tooltipPermanent: false,

            /* Do not work:
            direction: 'top',
            position: 'top',
            tooltipDirection: 'top',
            tooltipPosition: 'top',
            */
            tooltipHideWhenPopupOpen: true
        };

    nsObservations.toChar = '&nbsp;/&nbsp;'; //'&#9656;'; //Same as in fcoo-jquery-bootstrap-highcharts/src/time-series.js

    function getMapIdFromPopupEvent( popupEventOrMapId ){
        return typeof popupEventOrMapId == 'string' ? popupEventOrMapId : nsObservations.getMapId(popupEventOrMapId.target._map);
    }

    //Sets the methods for different func-lists
    nsObservations.isActiveFuncList.push('isShownInModal');
    nsObservations.updateLastObservationFuncList.push('updateLastObservation_in_modal');
    nsObservations.updateObservationFuncList.push('updateObservation_in_modal');
    nsObservations.updateForecastFuncList.push('updateForecast_in_modal');

    $.extend(nsObservations.Location.prototype, {
        /*********************************************
        init
        *********************************************/
        init: function( _init ){ return function(){
            _init.apply(this, arguments);

            this.latLng = this.options.position ? L.latLng( this.options.position ) : null;


            /*
            modalElements = {
                map-id: {
                    observationGroup-id: {
                        $lastObservation      : []$-element   //Set of $-elements containing the last measured value
                        $observationStatistics: []$-element   //Set of $-elements containing the statistics for previous observations for eg. 6h, 12h, and 24h = nsObservations.observationPeriods
                        $forecastStatistics   : []$-element   //Set of $-elements containing the forecast statistics for eg. 6h, 12h, and 24h = nsObservations.forecastPeriods
                    }
                }
            }
            There is a {$lastObservation, $observationStatistics, $forecastStatistics} with $-elements for each map and each observation-group
            */

            this.markers = {};
            this.modalElements = {};

            this.popups = {};

            this.openPopupAsNormal = true;

        } }(nsObservations.Location.prototype.init),

        /*********************************************
        isVisible(mapId) - return true if the location is shown on the map (mapId)
        *********************************************/
        isVisible: function(mapId){
            var result = false;
            $.each(this.observationGroups, function(id, observationGroup){
                if (observationGroup.isVisible(mapId))
                    result = true;
            });
            return result;
        },

        /*********************************************
        isShownInModal() - return true if the location has any data (observation and/or forecast) shown in any modal (eg. popup)
        *********************************************/
        isShownInModal: function(){
            var result = false;

            $.each(this.modalElements, function(mapId, obsGroups){
                $.each(obsGroups, function(obsGroupId, elementGroups){
                    $.each(elementGroups, function($elementGroupId, elementList){
                        if (elementList && elementList.length)
                            result = true;
                    });
                });
            });
            return result;
        },

        /*********************************************
        createMarker
        *********************************************/
        createMarker: function(options){
            var markerOptions = $.extend(true, {}, bsMarkerOptions, options || {});
            markerOptions.locationId = this.id;
            markerOptions._this = this;
            markerOptions.svg = this.createSVG;


            $.each(this.observationGroupList, function(index, observationGroup){
                markerOptions.markerClassName += ' obs-group-marker-' + observationGroup.options.index;
            });
            markerOptions.tooltip = {text: this.name};

            return L.bsMarkerSimpleSquare( this.latLng, markerOptions);
        },

        /*********************************************
        _updateAny$elemetList
        Update all $-elements in the list of $-elements
        *********************************************/
        _updateAny$elemetList: function(listId, valueFunc /*function(station)*/){
            var _this = this;
            $.each(this.observationGroupStations, function(observationGroupId, station){
                $.each(_this.modalElements, function(mapId, obsGroups){
                    var elements = obsGroups[observationGroupId];
                    if (elements)
                        $.each(elements[listId] || [], function(index, $element){
                            $element.html(valueFunc(station, index));
                        });
                });
            });
            return this;
        },

        /*********************************************
        updateLastObservation_in_modal
        Update all $-elements in with latest value for observations
        modalElements[mapId][observationGroupId].$lastObservation: []$-element set of $-elements
        containing the last measured value. There is a []$-element for each map and each observation-group
        *********************************************/
        updateLastObservation_in_modal: function(){
            //If not displayed in any modal  => exit
            if (!this.isShownInModal())
                return;

            this._updateAny$elemetList('$lastObservation',
                function(station){ // = function(station, index)
                    var dataSet = station.getDataSet(true, false); //Last observation

                    //If the timestamp is to old => return '?'
                    return station.datasetIsRealTime(dataSet) ? station.formatDataSet(dataSet, false) : '?';
                }
            );
        },

        /*********************************************
        updateObservation_in_modal
        Update all $-elements in with latest value and stat (min, mean, max) for observations
        modalElements[mapId][observationGroupId].$lastObservation: []$-element set of $-elements
        containing the last measured value. There is a []$-element for each map and each observation-group
        *********************************************/
        updateObservation_in_modal: function(){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            //Update stat for previous observations
            this._updateAny$elemetList('$observationStatistics', function(station, index){ return station.formatPeriodStat(index, false); } );
        },


        /*********************************************
        updateForecast_in_modal
        Update all $-elements in with stat (min, mean, max) for forecast
        modalElements[mapId][observationGroupId].$forecastStatistics: []$-element.
            One $-element for each interval defined by nsObservations.forecastPeriods
        *********************************************/
        updateForecast_in_modal: function(){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            this._updateAny$elemetList('$forecastStatistics', function(station, index){ return station.formatPeriodStat(index, true); } );
        },


        /*********************************************
        addPopup
        *********************************************/
        addPopup: function(mapId, marker){
            var _this = this;
            marker.bindPopup({
                width  : 265,

                fixable: true,
                //scroll : 'horizontal',

                //noVerticalPadding:  true,
                //noHorizontalPadding: true,

                header : this.getHeader(),

                isMinimized: true,
                minimized  : {
                    showTooltip: true,
                    width    : 84,
                    className: 'text-center',

                    //showHeaderOnClick: true,
                    content       : this.createMinimizedPopupContent,
                    contentContext: this,
                    dynamic       : true,
                },

                content       : this.createNormalPopupContent,
                contentContext: this,
                dynamic       : true,
                buttons: [{
                    id     : 'mini',
                    icon   : 'far fa-message-middle',
                    text   : {da: 'Vis', en: 'Show'},
                    title  : {da: 'Vis seneste måling', en: 'Show latest measurement'},
                    class  : 'min-width',
                    context: this,
                    onClick: function(){
                        this.popupMinimized( mapId );
                    }

                },{
                    id      : 'extend',
                    //icon    : ['fa-chart-line', 'fa-table'],
                    //text    : {da:'Graf og tabel', en:'Chart and Table'},
                    icon    : 'far fa-chart-line',
                    text    : {da:'Vis graf', en:'Show Chart'},

                    onClick : function(){
                        $.bsModal({
                            header: _this.getHeader(),
                            flexWidth: true,
                            megaWidth: true,
                            content: function( $body ){
                                _this.createCharts($body, true, mapId);
                            },
                            remove: true,
                            show: true
                        });
//                        marker._popup.setSizeExtended();
                    }
                }],
                footer: {da:'Format: Min'+nsObservations.toChar+'Maks (Middel)', en:'Format: Min'+nsObservations.toChar+'Max (Mean)'},

                //isExtended: true,
                NOT_NOW_extended: {
                    noVerticalPadding  :  true,
                    noHorizontalPadding: true,

                    width  :      nsObservations.imgWidth,
                    //height : 30 + 2*nsObservations.imgHeight,

                    content       : this.createExtendedPopupContent,
                    contentContext: this,
                    dynamic       : true,

                    _buttons: false,
                    _footer : false,
                },

            });
            marker.on('popupopen',  this.popupOpen,  this );
            marker.on('popupclose', this.popupClose, this );
        },

        /*********************************************
        popupOpen
        *********************************************/
        popupOpen: function( popupEvent ){
            var mapId = nsObservations.getMapId(popupEvent.target._map);

            this.popups[mapId] = popupEvent.popup;

            if (this.openPopupAsNormal)
                popupEvent.popup.setSizeNormal();
        },

        /*********************************************
        popupClose
        *********************************************/
        popupClose: function( popupEventOrMapId ){
            var mapId = getMapIdFromPopupEvent(popupEventOrMapId);
            delete this.modalElements[mapId];
            delete this.popups[mapId];
        },


        /*********************************************
        popupMinimized
        Minimize and pin popup
        *********************************************/
        popupMinimized: function( popupEventOrMapId ){
            var mapId = getMapIdFromPopupEvent(popupEventOrMapId),
                marker = this.markers[mapId];

            if (!marker) return this;

            if (marker.isPopupOpen())
                marker.getPopup()
                    .setSizeMinimized()
                    ._setPinned(true);
            else {
                this.openPopupAsNormal = false;
                this.markers[mapId].openPopup();
                this.popups[mapId]._setPinned(true);
                this.openPopupAsNormal = true;
            }
            return this;
        },

        /*********************************************
        _getModalElements
        *********************************************/
        _getModalElements: function(mapId){
            var mapElements = this.modalElements[mapId] = this.modalElements[mapId] || {};
            $.each(this.observationGroupStations, function(observationGroupId){
                mapElements[observationGroupId] = mapElements[observationGroupId] || {
                    $lastObservation      : [],
                    $observationStatistics: [],
                    $forecastStatistics   : []
                };
            });
            return mapElements;
        },

        /*********************************************
        createMinimizedPopupContent
        = list of parameter-name, last value
        *********************************************/
        createMinimizedPopupContent: function( $body, popup, map ){
            var mapElements = this._getModalElements( nsObservations.getMapId(map) );

            $.each(this.observationGroups, function(id, observationGroup){
                var $lastObservation = mapElements[id].$lastObservation;

                //Content for minimized mode
                var $div =
                    $('<div/>')
                        .addClass('latest-observation text-center no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        ._bsAddHtml({text: observationGroup.shortName, textClass:'obs-group-header show-for-multi-obs-group fa-no-margin d-block'})
                        ._bsAddHtml({text: ' ', textStyle: 'bold', textClass:'d-block'}),
                    $elem = $div.find('span:last-child');

                $elem._bsAddHtml({icon: ns.icons.working}),

                $lastObservation.push($elem);

                $body.append($div);
            });

            this.updateLastObservation();
        },

        /*********************************************
        createNormalPopupContent
        = table with previous measurments, list of last observation(s)  and table with forecast statistics
        *********************************************/
        createNormalPopupContent: function( $body, popup, map ){
            var _this          = this,
                mapElements    = this._getModalElements( nsObservations.getMapId(map) ),
                tempClassName  = ['TEMP_CLASS_NAME_0', 'TEMP_CLASS_NAME_1', 'TEMP_CLASS_NAME_2'],
                hasAnyForecast = false;

            /*Create content in tree tables:
                1: $table_prevObservation = Stat for previous measurements
                2: $table_lastObservation = Latest measurement(s)
                3: $table_forecast        = Stat for forecasts
            */
            var $table_prevObservation = $('<table/>').addClass('obs-statistics'),
                $table_lastObservation = $('<table/>').addClass('last-observation'),
                $table_forecast        = $table_prevObservation.clone();

                //Add header to previous observation and forecast
                var $tr = $('<tr/>').appendTo($table_prevObservation);
                $.each(nsObservations.observationPeriods, function(index, hours){
                    $('<td></td>')
                        .i18n({da:'Seneste '+hours+'t', en:'Prev. '+hours+'h'})
                        .appendTo($tr);
                });

                $tr = $('<tr/>').appendTo($table_forecast);
                $.each(nsObservations.forecastPeriods, function(index, hours){
                    $('<td></td>')
                        .i18n({da:'Næste '+hours+'t', en:'Next '+hours+'h'})
                        .appendTo($tr);
                });

            $.each(this.observationGroupList, function(index, observationGroup){
                var groupElements = mapElements[observationGroup.id];

                //Add the group-name as a header but only visible when there is only one group visible
                $body._bsAppendContent({
                    type  : 'textbox',
                    text  : observationGroup.header,
                    center: true,
                    class : 'obs-group-header show-for-single-obs-group show-for-obs-group-'+observationGroup.options.index
                });

                //Check if any stations have forecast
                var hasForecast = _this.observationGroupStations[observationGroup.id].forecast;
                if (hasForecast)
                    hasAnyForecast = true;

                /******************************************
                Last observation
                *******************************************/
                var $tr = $('<tr/>')
                            .addClass('show-for-obs-group-'+observationGroup.options.index)
                            .appendTo($table_lastObservation);
                $('<td/>')
                    .addClass('obs-group-header show-for-multi-obs-group')
                    ._bsAddHtml({text: observationGroup.name})
                    .appendTo($tr);

                var $td = $('<td/>')
                    .addClass('fw-bold')
                    .appendTo($tr);

                groupElements.$lastObservation.push($td);


                /******************************************
                Statistics for previous observations and forecast
                ******************************************/
                //Row with observation group name
                $tr = $('<tr/>')
                        .addClass('obs-group-header show-for-multi-obs-group')
                        .addClass('show-for-obs-group-'+observationGroup.options.index)
                        .append(
                            $('<td colspan="'+nsObservations.forecastPeriods.length+'"/>')._bsAddHtml({text: observationGroup.header})
                        );
                $tr.appendTo($table_forecast);
                $tr.clone().appendTo($table_prevObservation);


                function appendValueTd($tr, withSpinner){
                    var $span =
                            $('<span/>')
                                .addClass('value')
                                .html(withSpinner ? '<i class="'+ns.icons.working+'"/>' : '&nbsp;');
                    $('<td/>')
                        .append($span)
                        .appendTo($tr);
                    return $span;
                }

                //Create table with stat for previous observations and stat for forecast
                var $tr_prevObservation = $('<tr/>')
                        .addClass('fw-bold no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        .appendTo($table_prevObservation),
                    $tr_forecast = $tr_prevObservation.clone().appendTo($table_forecast),
                    i;

                for (i=0; i<nsObservations.observationPeriods.length; i++)
                    groupElements.$observationStatistics.push( appendValueTd($tr_prevObservation, i==1));

                if (hasForecast)
                    for (i=0; i<nsObservations.forecastPeriods.length; i++)
                        groupElements.$forecastStatistics.push( appendValueTd($tr_forecast, i==1));
                else
                    $('<td colspan="'+nsObservations.forecastPeriods.length+'"/>')
                        ._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
                        .appendTo($tr_forecast);
            });

            //Load observation
            this.loadObservation();

            //Load forecast (if any)
            this.loadForecast();


            //Append tree texboxes with the tree tables
            $body._bsAppendContent([
                {type: 'textbox', label: {da:'Forrige målinger ', en:'Previous Measurements'}, icon: ns.icons.working, iconClass: tempClassName[0], center: true},
                {type: 'textbox', label: {da:'Seneste måling',    en:'Latest Measurement'},    icon: ns.icons.working, iconClass: tempClassName[1], center: true, darkBorderlabel: true},
                {type: 'textbox', label: {da:'Prognoser',         en:'Forecasts'},             icon: ns.icons.working, iconClass: tempClassName[2], center: true}
            ]);

            //Insert $table_XX instead of span or remove it
            $.each([
                $table_prevObservation,
                $table_lastObservation,
                hasAnyForecast ? $table_forecast : $('<span/>')._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
            ], function(index, $element){
                var $span = $body.find('.'+tempClassName[index]),
                    $container = $span.parent();

                $container.empty();
                $container.append($element);
            });

        },

        /*********************************************
        createExtendedPopupContent
        = table with all observations + forecast and chart
        *********************************************/
        createExtendedPopupContent: function( $body ){

            this.createCharts($body, false );

        }

    });

}(jQuery, L, this.i18next, this.moment, this, document));


