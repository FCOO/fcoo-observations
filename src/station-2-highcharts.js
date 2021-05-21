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
            var obsGroupOptions = this.observationGroup.options,
                startTimestampValue = moment().valueOf() - moment.duration(obsGroupOptions.historyPeriod).valueOf(),
                parameter           = this.parameterList[0].parameter,
                obsDataList         = this.getChartDataList(parameter, false, startTimestampValue),

                result = {
                    parameter: parameter,
                    unit     : this.getDisplayUnit(parameter),
                    series   : [],
                    yAxis    : {
                        minRange: obsGroupOptions.minRange
                    }
                },

                maxGap = obsGroupOptions.maxGap;

            //Style and data for observations
            result.series.push({
                color     : obsGroupOptions.index,
                marker    : true,
                markerSize: 2,
                maxGap    : maxGap,
                visible   : this.observationGroup.isVisible(mapOrMapId),
                data      : obsDataList
            });


            if (this.forecast){
                var forecastDataList = this.getChartDataList(parameter, true),

                    firstObsTimestampValue = obsDataList.length ? obsDataList[0][0] : startTimestampValue,
                    lastObsTimestampValue  = obsDataList.length ? obsDataList[obsDataList.length-1][0] : startTimestampValue,

                    lastTimestampValueBeforeObs = 0,
                    firstTimestampValueAfterObs = Infinity;

                $.each( forecastDataList, function(index, data){
                    var timestampValue = data[0];
                    if (timestampValue < firstObsTimestampValue)
                        lastTimestampValueBeforeObs = Math.max(timestampValue, lastTimestampValueBeforeObs);
                    if (timestampValue > lastObsTimestampValue)
                        firstTimestampValueAfterObs = Math.min(timestampValue, firstTimestampValueAfterObs);
                });


                //Style and data for forecast before AND after first and last observation
                result.series.push({
                    deltaColor: +2,
                    tooltipPrefix: {da:'Prognose: ', en:'Forecast: '},
                    noTooltip : false,
                    marker    : false,
                    maxGap    : maxGap,
                    data      : this.getChartDataList(parameter, true, startTimestampValue, Infinity, [lastTimestampValueBeforeObs, firstTimestampValueAfterObs])
                });

                //Style and data for forecast when there are observations
                result.series.push({
                    deltaColor: +2,
                    noTooltip : true,
                    marker    : false,
                    dashStyle : 'Dash',
                    maxGap    : maxGap,
                    data      : this.getChartDataList(parameter, true, lastTimestampValueBeforeObs, firstTimestampValueAfterObs)
                });
            }

            return result;
        },

        /*****************************************************
        getChartDataList
        *****************************************************/
        getChartDataList: function(parameter, forecast, minTimestepValue = 0, maxTimestepValue = Infinity, clip){
            var result = [],
                parameterId = parameter.id,
                unit        = parameter.unit,
                toUnit      = this.getDisplayUnit(parameter),
                dataList    = forecast ? this.forecastDataList : this.observationDataList; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}

            $.each(dataList, function(index, dataSet){
                var timestepValue = moment(dataSet.timestamp).valueOf(),
                    value         = dataSet[parameterId];

                if ((timestepValue >= minTimestepValue) && (timestepValue <= maxTimestepValue )){
                    //timestepValue inside min-max-range
                    var add = true;
                    if (clip){
                        //Check if timestepValue is OUTSIDE clip[0] - clip[1]
                        add = (timestepValue <= clip[0]) || (timestepValue >= clip[1]);
                    }
                    if (add)
                        result.push([timestepValue, nsParameter.convert(value, unit, toUnit)]);

                }
            });

            result.sort(function(timestampValue1, timestampValue2){ return timestampValue1[0] - timestampValue2[0];});

            return result;
        }

    });



}(jQuery, this.i18next, this.moment, this, document));


