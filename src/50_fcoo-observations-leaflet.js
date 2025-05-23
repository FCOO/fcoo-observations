/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, L, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    let ns = window.fcoo = window.fcoo || {},
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
        }; }(ns.FCOOObservations.prototype.init),

        /**********************************************************
        onResolve
        **********************************************************/
        onResolve: function( _onResolve ){ return function(){
            _onResolve.apply(this, arguments);

            //All data are loaded => initialize all maps and update the geoJSON-data and update any layer added before the data was ready
            this._initializeMaps();
            $.each(this.maps, function(id, options){
                if (!options.dataAdded){
                    options.geoJSONLayer.addData( this._getGeoJSONData() );
                    options.dataAdded = true;
                }
            }.bind(this));
        }; }(ns.FCOOObservations.prototype.onResolve),

        /**********************************************************
        _initializeMaps(map)
        **********************************************************/
        _initializeMaps: function(map){
            let maps = map ? [{map:map}] : this.maps;

            $.each(maps, function(index, mapObj){
                let mapId = nsObservations.getMapId(mapObj.map);
                $.each(this.observationGroups, function(groupId, observationGroup){
                    let stateId = groupId+'_'+mapId,
                        show = this.state && this.state[stateId];
                    observationGroup.toggle(mapObj.map, !!show);
                }.bind(this));
            }.bind(this));
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
            let mapId = nsObservations.getMapId(mapOrMapId),
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
            let thisOptionsGeoJSONOptions = this.options.geoJSONOptions;
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

            let result = L.geoJSON(null, this.geoJSONOptions);

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
            let mapId = nsObservations.getMapId(this._map),
                location = this.fcooObservation.locations[marker.options.locationId];

            location.markers[mapId] = marker;
            feature.properties.addPopup( mapId, marker );
        },

        _geoJSON_onAdd: function(event){
            let geoJSONLayer = event.target,
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
            let state = this.state;
            this.state = {};
            let mapId = nsObservations.getMapId(event.target._map);
            delete this.maps[mapId];
            $.each(this.observationGroups, function(id, observationGroup){
                observationGroup.hide(mapId);
            });
            this.state = state;
        },

        _getGeoJSONData: function(){
            if (!this.ready)
                return null;

            if (!this.geoJSONData){
                this.geoJSONData = { type: "FeatureCollection", features: []};


                //Create all locations and add them to the geoJSON-data if they are included in a observation-group
                this.locationList.forEach( function(location){
                    if (location.observationGroupList.length)
                        this.geoJSONData.features.push({
                            type      : "Feature",
                            geometry  : {type: "Point", coordinates: [location.latLng.lng, location.latLng.lat]},
                            properties: location
                        });
                }.bind(this));
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

            /*
            Adjust this.options.iconOptions
            iconOptions = STRING, or
            iconOptions = {vertical: BOOLEAN, position: NUMBER (1-14) or STRING}

            The position as STING can have the following values
            BESIDE-LEFT, LEFT, CENTER, RIGHT, BESIDE-RIGHT (vertical lines), or
            AIR, SURFACE, SUBSURFACE, MIDDLE, SEAFLOOR (horizintal lines)
            */
            if (typeof this.options.iconOptions == 'string')
                this.options.iconOptions = {position: this.options.iconOptions};

            let iconOpt = this.options.iconOptions,
                pos = iconOpt.position.toUpperCase(),
                numPos = 7;

            if (typeof iconOpt.position == 'string'){
                switch (pos){
                    case 'AIR'          : numPos =  2; break;
                    case 'SURFACE'      : numPos =  5; break;
                    case 'SUBSURFACE'   : numPos =  8; break;
                    case 'MIDDLE'       : numPos = 10; break;
                    case 'SEAFLOOR'     : numPos = 12; break;

                    case 'BESIDE-LEFT'  : numPos =  2; break;
                    case 'LEFT'         : numPos =  4; break;
                    case 'CENTER'       : numPos =  7; break;
                    case 'RIGHT'        : numPos = 10; break;
                    case 'BESIDE-RIGHT' : numPos = 12; break;

                    default             : numPos =  5;
                }
                iconOpt.position = numPos;
            }

            iconOpt.vertical = ['BESIDE-LEFT', 'LEFT', 'CENTER', 'RIGHT', 'BESIDE-RIGHT'].includes(pos);

            //Create faIconPopup:[STRING]= icon in eq. bsModal or popups
            this.faIconPopup = L.bsMarkerAsIcon('observations', null, false );

            //Create faIcon:[STRING]: A extended icon similar to the icon used as marker
            this.faIcon = L.bsMarkerAsIcon('observations', null, false );

            //Remove the frame icon temporally
            let frameIcon = this.faIcon[0].pop();

            //Add a darker color representing the ground or sea
            this.faIcon[0].push('fa-obs-line fa-obs-line-horizontal fa-obs-line-surface');

            this.faIcon[0].push('fa-obs-line fa-obs-line-'+(iconOpt.vertical ? 'vertical' : 'horizontal') + ' fa-obs-line-pos-'+numPos + (iconOpt.length ? ' fa-obs-line-'+iconOpt.length : ''));

            //Add the frame icon again and makes it on top
            this.faIcon[0].push(frameIcon + '  position-relative');

            this.faIconClass = 'obs-group-icon-container';

            //Copy icon-info into standard options
            this.options.icon = this.faIcon;
            this.options.iconClass = this.faIconClass;

        }; }(nsObservations.ObservationGroup.prototype.init),

    });

    /***********************************************************************************
    ************************************************************************************
    Extend Location with methods for showing observations on a Leaflet-map
    ************************************************************************************
    ************************************************************************************/
    const bsMarkerOptions = {
            size     : 16, //Changed from 'small' to have same size as icon
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

        }; }(nsObservations.Location.prototype.init),

        /*********************************************
        isVisible(mapId) - return true if the location is shown on the map (mapId)
        *********************************************/
        isVisible: function(mapId){
            let result = false;
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
            let result = false;

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
            let _this = svgOptions.marker.options._this,
                dim   = svgOptions.width + 2; //svgOptions.width is inner-width

            svgOptions.draw.attr({'shape-rendering': "crispEdges"});

            //Draw darker background to represent below surface
            svgOptions.draw.line(0, 10, 16, 10).stroke({color: '#cd9c0f', width: 9});   //Color = hard copy from css for .fa-obs-line-surface

            $.each(_this.observationGroupList, function(index, observationGroup){
                /*
                For each observationGroup the location is part of => draw a vertical or horizontal line
                iconOpt = {
                    vertical: [BOOLEAN]
                    position: NUMBER Between 1 and 14
                    vertical: BOOLEAN
                    length  : STRING, "1-2", 2-2", "1-3", "2-3", or "3-3"
                */

                let iconOpt  = observationGroup.options.iconOptions,
                    pos      = iconOpt.position,
                    lgd      = iconOpt.length,
                    vertical = iconOpt.vertical,
                    start    = 0,
                    end      = dim;

                if (lgd)
                    switch (lgd){
                        case '1-2':                                 end = (dim / 2)  - 1;           break;
                        case '2-2': start = (dim/2)  - 1;                                           break;
                        case '1-3':                                 end = Math.floor(dim / 3);      break;
                        case '2-3': start = Math.floor(dim/3)-1;    end = Math.floor(2 * dim / 3);  break;
                        case '3-3': start = Math.floor(2*dim/3)-1;                                  break;
                    }

                svgOptions.draw
                    .line(
                        vertical ? pos   : start,
                        vertical ? start : pos,
                        vertical ? pos   : end,
                        vertical ? end   : pos
                    )
                    .stroke({
                        color: svgOptions.borderColor,
                        width: 2
                    })
                    .addClass('obs-group-marker-'+observationGroup.options.index);
            });
        },

        /*********************************************
        createMarker
        *********************************************/
        createMarker: function(options){
            let markerOptions = $.extend(true, {}, bsMarkerOptions, options || {});
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
        _updateAny$elemetList: function(listId, valueFunc/*=function(station)*/, onlyGroupId){
            $.each(this.observationGroupStations, function(observationGroupId, station){
                if (!onlyGroupId || (onlyGroupId == observationGroupId))
                    $.each(this.modalElements, function(mapId, obsGroups){
                        let elements = obsGroups[observationGroupId];
                        if (elements)
                            $.each(elements[listId] || [], function(index, $element){
                                $element.html(valueFunc(station, index));
                            });
                    });
            }.bind(this));
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

            this._updateAny$elemetList(
                '$lastObservation',
                function(station){
                    let dataSet = station.getDataSet(true, false); //Last observation

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
        updateObservation_in_modal: function( onlyGroupId ){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            //Update stat for previous observations
            this._updateAny$elemetList(
                '$observationStatistics',
                function(station, index){
                    return station.formatPeriodStat(index, false);
                },
                onlyGroupId
            );
        },


        /*********************************************
        updateForecast_in_modal
        Update all $-elements in with stat (min, mean, max) for forecast
        modalElements[mapId][observationGroupId].$forecastStatistics: []$-element.
            One $-element for each interval defined by nsObservations.forecastPeriods
        *********************************************/
        updateForecast_in_modal: function( onlyGroupId ){
            //If not shown in modal => exit
            if (!this.isShownInModal())
                return;

            this._updateAny$elemetList(
                '$forecastStatistics',
                function(station, index){
                    return station.formatPeriodStat(index, true);
                },
                onlyGroupId
            );
        },


        /*********************************************
        addPopup
        *********************************************/
        addPopup: function(mapId, marker){
            let scrollContent = this.observationGroupList.length > 2;

            marker.bindPopup({
                width  : 258, //265,

                fixable: true,
                //scroll : 'horizontal',

                //noVerticalPadding:  true,
                //noHorizontalPadding: true,

                header : this.getHeader(),

                isMinimized: true,
                minimized  : {
                    showTooltip: true,
                    width    : 101, //96,
                    className: 'text-center latest-observation-body',

                    //showHeaderOnClick: true,
                    onResize      : this.onMimimizedResize,
                    content       : this.createMinimizedPopupContent,
                    contentContext: this,
                    dynamic       : true,
                },

                content       : this.createNormalPopupContent,
                contentContext: this,
                dynamic       : true,
                scroll        : scrollContent,
                maxHeight     : scrollContent ? 400 : null,
                buttons: [{
                    id     : 'mini',
                    icon   : 'far fa-message-middle',
                    text   : {da: 'Vis', en: 'Show'},
                    title  : {da: 'Vis seneste måling', en: 'Show latest measurement'},
                    class  : 'min-width',
                    context: this,
                    //onClick: function(){ this.popupMinimized( mapId ); }
                    onClick: this.popupMinimized.bind(this, mapId)

                },{
                    id      : 'extend',
                    //icon    : ['fa-chart-line', 'fa-table'],
                    //text    : {da:'Graf og tabel', en:'Chart and Table'},
                    icon    : 'far fa-chart-line',
                    _text    : {da:'Vis graf', en:'Show Chart'},
                    text    : {da:'Graf', en:'Chart'},

                    onClick : this.showCharts.bind(this, mapId),

                }, window.INCLUDETABLESINMODAL ? {
                    id     : 'table',
                    icon   : 'far fa-table',
                    _text   : {da:'Vis tabel', en:'Show Table'},
                    text   : {da:'Tabel', en:'Table'},

                    //onClick: function(){ this.showTables(mapId); }.bind(this),
                    onClick: this.showTables.bind(this, mapId),
                } : undefined],
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
            let mapId = nsObservations.getMapId(popupEvent.target._map);
            this.popups[mapId] = popupEvent.popup;

            if (this.openPopupAsNormal)
                popupEvent.popup.setSizeNormal();
        },

        /*********************************************
        popupClose
        *********************************************/
        popupClose: function( popupEventOrMapId ){
            let mapId = getMapIdFromPopupEvent(popupEventOrMapId);
            delete this.modalElements[mapId];
            delete this.popups[mapId];
        },


        /*********************************************
        popupMinimized
        Minimize and pin popup
        *********************************************/
        popupMinimized: function( popupEventOrMapId ){
            let mapId = getMapIdFromPopupEvent(popupEventOrMapId),
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
            let mapElements = this.modalElements[mapId] = this.modalElements[mapId] || {};
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
        onMimimizedResize
        Called when the content of a minimized popup is changed
        *********************************************/
        onMimimizedResize: function( size, popup, $body, options, map ){
            const isMultiObsGroup = $(map.getContainer()).hasClass('multi-obs-group');

            let fontSize       = parseFloat($body.css('font-size'   )),
                padding        = parseFloat($body.css('padding-left')),
                innerTextWidth = 1.5*fontSize;

            if (isMultiObsGroup){
                let textList = []; //List of shortNames of displayed parameters
                this.observationGroupList.forEach( observationGroup => {
                    if (observationGroup.isVisible(map))
                        textList.push( i18next.sentence(observationGroup.shortName) );
                });
                innerTextWidth = Math.ceil($.getTextWidth(textList, fontSize));
            }
            else {
                //Only one group visible on the map => Only value is displayed in popup => Find the <span> with the last measurement and use its width
                let visibleObsGroupIndex = -1;
                this.observationGroupList.forEach( observationGroup => {
                    if (observationGroup.isVisible(map))
                        visibleObsGroupIndex = observationGroup.options.index;
                });

                const elem = $body.find('.latest-observation.show-for-obs-group-'+visibleObsGroupIndex+' .the-value');
                if (elem)
                    innerTextWidth = Math.max(innerTextWidth, $(elem).innerWidth());
            }
            popup.setWidth({minimized: 1 + padding + innerTextWidth + padding + 1} );
        },

        /*********************************************
        createMinimizedPopupContent
        = list of parameter-name, last value
        *********************************************/
        createMinimizedPopupContent: function( $body, popup, map ){
            let mapElements = this._getModalElements( nsObservations.getMapId(map) );
            $.each(this.observationGroups, function(id, observationGroup){
                let $lastObservation = mapElements[id].$lastObservation;

                //Content for minimized mode
                let $div =
                    $('<div/>')
                        .addClass('latest-observation text-center no-border-border-when-last-visible show-for-obs-group-'+observationGroup.options.index)
                        ._bsAddHtml({text: observationGroup.shortName, textClass:'obs-group-header show-for-multi-obs-group fa-no-margin text-nowrap d-block'})
                        ._bsAddHtml({text: ' ', textStyle: 'bold', textClass:'the-value text-nowrap'}),
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
            let mapElements    = this._getModalElements( nsObservations.getMapId(map) ),
                //tempClassName  = ['TEMP_CLASS_NAME_0', 'TEMP_CLASS_NAME_1', 'TEMP_CLASS_NAME_2'],
                hasAnyForecast = false;

            /*Create content in tree tables:
                1: $table_prevObservation = Stat for previous measurements
                2: $table_lastObservation = Latest measurement(s)
                3: $table_forecast        = Stat for forecasts
            */
            let $table_prevObservation = $('<table/>').addClass('obs-statistics prev text-center'),
                $table_lastObservation = $('<table/>').addClass('last-observation text-center'),
                $table_forecast        = $('<table/>').addClass('obs-statistics forecast text-center');

                //Add header to previous observation and forecast
                let $tr = $('<tr/>').appendTo($table_prevObservation);
                $.each(nsObservations.observationPeriods, function(index, hours){
                    $('<td></td>')
                        .addClass('value')
                        .i18n({da:'Seneste '+hours+'t', en:'Prev. '+hours+'h'})
                        .appendTo($tr);
                });

                $tr = $('<tr/>').appendTo($table_forecast);
                $.each(nsObservations.forecastPeriods, function(index, hours){
                    $('<td></td>')
                        .addClass('value')
                        .i18n({da:'Næste '+hours+'t', en:'Next '+hours+'h'})
                        .appendTo($tr);
                });

            $.each(this.observationGroupList, function(index, observationGroup){
                let groupElements = mapElements[observationGroup.id];

                //Add the group-name as a header but only visible when there is only one group visible
                $body._bsAppendContent({
                    type  : 'textbox',
                    text  : observationGroup.header,
                    center: true,
                    class : 'obs-group-header show-for-single-obs-group show-for-obs-group-'+observationGroup.options.index
                });

                //Check if any stations have forecast
                let hasForecast = this.observationGroupStations[observationGroup.id].forecast;
                if (hasForecast)
                    hasAnyForecast = true;

                /******************************************
                Last observation
                *******************************************/
                let $tr = $('<tr/>')
                            .addClass('show-for-obs-group-'+observationGroup.options.index)
                            .appendTo($table_lastObservation);
                $('<td/>')
                    .addClass('obs-group-header show-for-multi-obs-group')
                    ._bsAddHtml({text: observationGroup.name})
                    .appendTo($tr);

                let $td = $('<td/>')
                    .addClass('fw-bold _time-now-color _time-now-text-color')
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
                    let $span =
                            $('<span/>')
                                .addClass('value')
                                .html(withSpinner ? '<i class="'+ns.icons.working+'"/>' : '&nbsp;');
                    $('<td/>')
                        .addClass('value')
                        .append($span)
                        .appendTo($tr);
                    return $span;
                }

                //Create table with stat for previous observations and stat for forecast
                let $tr_prevObservation = $('<tr/>')
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
            }.bind(this));

            //Load observation
            this.loadObservation();

            //Load forecast (if any)
            this.loadForecast();


            $body._bsAppendContent({
                type     : 'accordion',
                //neverClose: true,
                multiOpen: true,
                allOpen  : true,
                children : [{
                    header              : {icon:'far fa-right-from-line fa-flip-horizontal', text: {da:'Forrige målinger ', en:'Previous Measurements'}},
                    className           : 'accordion-prev-observation',
                    noHorizontalPadding : true,
                    noVerticalPadding   : true,
                    content             : $table_prevObservation
                },{
                    header              : {icon:'fa-equals fa-rotate-90', text: {da:'Seneste måling', en:'Latest Measurement'}},
                    className           : 'accordion-last-observation',
                    noHorizontalPadding : true,
                    content             : $table_lastObservation
                },{
                    header              : {icon:'far fa-right-from-line', text: {da:'Prognoser', en:'Forecasts'}},
                    className           : 'accordion-forecast',
                    noHorizontalPadding : true,
                    content             : hasAnyForecast ? $table_forecast : $('<span/>')._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
                }]
            });


/*
            //Append tree texboxes with the tree tables
            $body._bsAppendContent([
                {type: 'textbox', label: {da:'Forrige målinger ', en:'Previous Measurements'}, icon: ns.icons.working, iconClass: tempClassName[0], center: true},
                {type: 'textbox', label: {da:'Seneste måling',    en:'Latest Measurement'},    icon: ns.icons.working, iconClass: tempClassName[1], center: true, darkBorderlabel: true},
                {type: 'textbox', label: {da:'Prognoser',         en:'Forecasts'},             icon: ns.icons.working, iconClass: tempClassName[2], center: true}
            ]);

            //Insert $table_XX instead of span or remove it
            [
                $table_prevObservation,
                $table_lastObservation,
                hasAnyForecast ? $table_forecast : $('<span/>')._bsAddHtml({text:{da:'Ingen prognoser', en:'No forecast'}})
            ].forEach( ($element, index) => {
                let $span = $body.find('.'+tempClassName[index]),
                    $container = $span.parent();

                $container.empty();
                $container.append($element);
            });
*/

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


