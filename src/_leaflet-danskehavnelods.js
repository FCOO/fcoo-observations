/****************************************************************************
leaflet-danskehavnelods.js

	(c) 2020, FCOO

	https://github.com/FCOO/leaflet-danskehavnelods
	https://github.com/FCOO

    Create an leaflet layer with marinas, ports, and bridges from
    Danish Geodata Agency https://www.danskehavnelods.dk

****************************************************************************/
(function ($, L, i18next, moment, window, document, undefined) {
	"use strict";


    var ns = window;

    /*****************************************************
    Location
    Reprecent a location with one or more 'stations'
    *****************************************************/
    var bsMarkerOptions = {
            size     : 'small',
            colorName: 'orange',
            round    : false,

            scaleInner      : 150,
            markerClassName : 'overflow-hidden',

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



    var Location = function(options){


    };

    Location.prototype = {

    };

}(jQuery, L, this.i18next, this.moment, this, document));



