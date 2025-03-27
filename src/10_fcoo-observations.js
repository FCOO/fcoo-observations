/****************************************************************************
	fcoo-observations.js,

	(c) 2020, FCOO

	https://github.com/FCOO/fcoo-observations
	https://github.com/FCOO

    Create an internal FCOO packages to read and display observations

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
	"use strict";

    let ns = window.fcoo = window.fcoo || {},
       //nsParameter = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};

    nsObservations.observationPeriods = [6, 12, 24]; //= The different hour-periods to display previous observation stat (min, mean, max) over. Must have length = 3
    nsObservations.forecastPeriods    = [6, 12, 24]; //= The different hour-periods to display forecast stat (min, mean, max) over. Must have length = 3

    /*
    To display stat for previous X (=observationPeriods[i]) hours of observations or Y (=forecastPeriods[i]) hours of forecast
    a minimum percent of hourly values are required. This percent is given in observation/forecast_minimumPercentValues
    */
    nsObservations.observation_minimumPercentValues = 2/3;
    nsObservations.forecast_minimumPercentValues    = 1;    //All forecast needed!


//********************************************************************************
$._getTextWidthCanvas = null;
$.getTextWidth = $.getTextWidth || function(text, options = {}){
    $._getTextWidthCanvas = $._getTextWidthCanvas || $('<canvas></canvas>').get(0);
    const ctx = $._getTextWidthCanvas.getContext("2d");

    let textList = Array.isArray( text ) ? text : [text],
        result = 0;

    if (typeof options == 'number')
        options = {fontSize: options};

    options =   $.extend({
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color',
                    fontSize  : 12
                }, options );

    options.fontSize = options.fontSize + (typeof options.fontSize == 'number' ? 'px' : '');

    ctx.font = options.fontSize + ' ' + options.fontFamily;
    if (options.italic)
        ctx.font = 'italic ' + ctx.font;
    if (options.bold)
        ctx.font = 'bold ' + ctx.font;

    textList.forEach( txt => result = Math.max( result, ctx.measureText(txt).width ) );

    return result + (options.padding || 0);

}

//********************************************************************************







    /***************************************************************
    fcooObservations = Current version of FCOOObservations
    nsObservations.getFCOOObservation(resolve) calls resolve with (ns.fcooObservations)
    nsObservations.fcooObservations is created first time
    ****************************************************************/
    nsObservations.fcooObservations = null;


    nsObservations.getFCOOObservations = function(resolve, whenFullLoaded, options){
        if (ns.fcooObservations && (!whenFullLoaded || ns.fcooObservations.fullLoaded)){
            resolve(ns.fcooObservations);
            return;
        }

        ns.fcooObservations = ns.fcooObservations || new ns.FCOOObservations(options);
        if (whenFullLoaded)
            ns.fcooObservations.resolveFullList.push(resolve);
        else
            ns.fcooObservations.resolveList.push(resolve);
    };


    /***************************************************************
    FCOOObservations
    ****************************************************************/
    ns.FCOOObservations = function(options = {}){
        this.options = $.extend(true, {}, {
			VERSION         : "{VERSION}",
            subDir          : {
                observations: 'observations',
                forecasts   : 'forecasts'
            },
            groupFileName           : 'observations-groups.json',
            locationFileName        : 'locations.json',
        }, options);

        //resolveList, resolveFullList = []FUNCTION(fcooObservations: FCOOObservations)
        //List of functions to be called when fcooObservations is created (this.resolveList) or when full loaded (resolveFullList)
        this.resolveList = [];
        this.resolveFullList = [];

        this.init();

        this.ready = false;
        this.fullLoaded = false;

        //Read observations-groups
        this.observationGroupList = [];
        this.observationGroups = {};

        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.groupFileName}),
            resolve : function(data){
                let standard = data.standard || {};
                let forceGroupIds = this.options.forceGroupIds || '';
                data.groupList.forEach( options => {
                    if (forceGroupIds  ? forceGroupIds.includes(options.id) : !options.inactive){
                        let standardNameList = (options.standard || '').split(' '),
                            ogOpt = {index: this.observationGroupList.length};

                        standardNameList.forEach( standardName => {
                            if (standardName && standard[standardName])
                                ogOpt = $.extend(true, ogOpt, standard[standardName]);
                        });

                        ogOpt = $.extend(true, ogOpt, options);

                        const newObservationGroup = new nsObservations.ObservationGroup(ogOpt, this);
                        this.observationGroupList.push(newObservationGroup);
                        this.observationGroups[newObservationGroup.id] = newObservationGroup;
                    }
                }, this);
            }.bind(this)
        });


        //Read locations
        this.locations = {};
        this.locationList = [];
        ns.promiseList.append({
            fileName: ns.dataFilePath({subDir: this.options.subDir.observations, fileName: this.options.locationFileName}),
            resolve : function(data){
                data.forEach( options => {
                    let location = new nsObservations.Location(options);
                    location.observations = this;
                    this.locationList.push(location);
                    this.locations[location.id] = location;
                }, this);
            }.bind(this),
        });

        //When the object is created and obs-groups and locations are loaded: Call all pending resolve-function (if any)
        ns.promiseList.append({
            data   : 'none',
            resolve: this._resolveList.bind(this, this.resolveList)

        });

        //Read setup for each observation-group
        ns.promiseList.append({
            data   : 'none',
            resolve: function(){

                this.observationGroupList.forEach( obsGroup => obsGroup._promise_setup() );

                ns.promiseList.append({
                    data   : 'none',
                    resolve: function(){
                        this.ready = true;

                        this.onResolve();

                        //When the object is fully loaded: Call all pending resolve-function (if any)
                        this._resolveList( this.resolveFullList );
                        this.fullLoaded = true;

                    }.bind(this)
                });
            }.bind(this)
        });
    };

    ns.FCOOObservations.prototype = {
        init: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },
        onResolve: function(){
            /* Empty here but can be extended in extentions of FCOOObservations */
        },

        //_resolveList = Call all function in list with this
        _resolveList: function( list = [] ){
            list.forEach( resolve => resolve(this), this);
            return this;
        }
    };
}(jQuery, this.i18next, this.moment, this, document));


