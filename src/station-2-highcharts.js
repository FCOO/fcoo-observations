/****************************************************************************
station.js

Station  = Single observation-station with one or more parametre.
Only one station pro Location is active within the same ObservationGroup

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};


    /****************************************************************************
    Extend Station with methods for creating and displaying a chart
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {



        /*****************************************************
        getChartsOptions
        *****************************************************/
        getChartsOptions: function(mapOrMapId){
            var parameter   = this.parameterList[0].parameter,
                obsDataList = this.getChartDataList(parameter),
                firstObsTimestampValue = obsDataList.length ? obsDataList[0][0] : 0,
                lastObsTimestampValue  = obsDataList.length ? obsDataList[obsDataList.length-1][0] : 0,

                result = {
                    parameter: parameter,
                    unit     : this.getDisplayUnit(parameter),
                    series   : [],
                    yAxis    : {minRange: this.observationGroup.options.minRange}
                },
                maxGap = this.observationGroup.options.maxGap;

            //Style and data for observations
            result.series.push({
                color     : this.observationGroup.options.index,
                marker    : true,
                markerSize: 2,
                maxGap    : maxGap,
                visible   : this.observationGroup.isVisible(mapOrMapId),
                data      : obsDataList
            });

            if (this.forecast){
                //Style and data for forecast before AND after first and last observation
                result.series.push({
                    deltaColor: +2,
    //tooltipPrefix: {da:' (DA 1) ', en:' (EN 1) '},
                    tooltipPrefix: {da:'Prognose: ', en:'Forecast: '},
                    noTooltip : false,
                    marker    : false,
                    maxGap    : maxGap,
                    data      : this.getChartDataList(parameter, true, firstObsTimestampValue, lastObsTimestampValue, true)
                });

                //Style and data for forecast when there are observations
                result.series.push({
                    deltaColor: +2,
                    noTooltip : true,
                    marker    : false,
                    dashStyle : 'Dash',
                    maxGap    : maxGap,
                    data      : this.getChartDataList(parameter, true, firstObsTimestampValue, lastObsTimestampValue)
                });
            }

            return result;
        },

        /*****************************************************
        getChartDataList
        *****************************************************/
        getChartDataList: function(parameter, forecast, minTimestepValue = 0, maxTimestepValue = Infinity, outside = false){
            var result = [],
                parameterId = parameter.id,
                unit        = parameter.unit,
                toUnit      = this.getDisplayUnit(parameter),
                dataList    = forecast ? this.forecastDataList : this.observationDataList; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}

            $.each(dataList, function(index, dataSet){
                var timestepValue = moment(dataSet.timestamp).valueOf(),
                    value         = dataSet[parameterId];

                if (
                        ( outside &&  ((timestepValue < minTimestepValue)  || (timestepValue >= maxTimestepValue)) ) ||
                        (!outside &&   (timestepValue >= minTimestepValue) && (timestepValue < maxTimestepValue )  )
                    )
                        result.push([timestepValue, nsParameter.convert(value, unit, toUnit)]);
            });

            result.sort(function(timestampValue1, timestampValue2){ return timestampValue1[0] - timestampValue2[0];});

            return result;
        }

    });



}(jQuery, this.i18next, this.moment, this, document));


