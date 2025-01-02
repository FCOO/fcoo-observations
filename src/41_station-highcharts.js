/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    /****************************************************************************
    Extend Station with methods for creating and displaying a chart
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {

        /*****************************************************
        getChartsOptions
        *****************************************************/
        getChartsOptions: function(mapOrMapId/*, inModal*/){
            let obsGroupOptions = this.observationGroup.options,

                data = this.getDefaultObsAndForecast(),
                defaultSeriesOptions = {
                    maxGap        : obsGroupOptions.maxGap,
                    directionArrow: data.isVector ? this.observationGroup.directionArrow : false
                },
                result = {
                    parameter: this.observationGroup.primaryParameter,
                    z        : this.observationGroup.z,
                    unit     : data.unit,
                    series   : [],
                    yAxis    : {
                        minRange: obsGroupOptions.minRange,
                        min     : data.scaleParameter.negative ? null : 0,
                    }
                };

            //Style and data for observations
            result.series.push({
                color     : obsGroupOptions.index,
                marker    : true,
                markerSize: 2,
                visible   : this.observationGroup.isVisible(mapOrMapId),
                data      : data.obsDataList
            });


            if (this.forecast){
                //Style and data for forecast before AND after first and last observation
                result.series.push({
                    deltaColor: +2,
                    tooltipPrefix: {da:'Prognose: ', en:'Forecast: '},
                    noTooltip : false,
                    marker    : false,
                    data      : data.forecastDataListNoObs
                });

                //Style and data for forecast when there are observations
                result.series.push({
                    deltaColor: +2,
                    noTooltip : true,
                    marker    : false,
                    dashStyle : 'Dash',
                    data      : data.forecastDataListWithObs,
                    directionArrow: false
                });
            }

            $.each(result.series, function(index, options){
                result.series[index] = $.extend(true, {}, defaultSeriesOptions, options);
            });
            return result;
        }
    });



}(jQuery, this.i18next, this.moment, this, document));


