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
        getChartsOptions: function(mapOrMapId/*, inModal*/){
            var obsGroupOptions = this.observationGroup.options,
                startTimestampValue = moment().valueOf() - moment.duration(obsGroupOptions.historyPeriod).valueOf(),
                parameter           = this.primaryParameter, //this.parameterList[0].parameter,
                isVector            = parameter.type == 'vector',
                scaleParameter      = isVector ? parameter.speed_direction[0] : parameter,
                obsDataList         = this.getChartDataList(parameter, false, startTimestampValue),

                defaultSeriesOptions = {
                    maxGap        : obsGroupOptions.maxGap,
                    directionArrow: isVector ? this.observationGroup.directionArrow : false
                },
                result = {
                    //parameter: parameter,
                    parameter: this.observationGroup.primaryParameter,
                    unit     : this.getDisplayUnit(scaleParameter),
                    series   : [],
                    yAxis    : {
                        minRange: obsGroupOptions.minRange,
                        min     : scaleParameter.negative ? null : 0,
                    }
                };

            //Style and data for observations
            result.series.push({
                color     : obsGroupOptions.index,
                marker    : true,
                markerSize: 2,
                visible   : this.observationGroup.isVisible(mapOrMapId),
                data      : obsDataList,
//HERdirectionArrow: true
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
                    data      : this.getChartDataList(parameter, true, startTimestampValue, Infinity, [lastTimestampValueBeforeObs, firstTimestampValueAfterObs])
                });

                //Style and data for forecast when there are observations
                result.series.push({
                    deltaColor: +2,
                    noTooltip : true,
                    marker    : false,
                    dashStyle : 'Dash',
                    data      : this.getChartDataList(parameter, true, lastTimestampValueBeforeObs, firstTimestampValueAfterObs),
                    directionArrow: false
                });
            }

            $.each(result.series, function(index, options){
                result.series[index] = $.extend(true, {}, defaultSeriesOptions, options);
            });

            return result;
        },

        /*****************************************************
        getChartDataList
        *****************************************************/
        getChartDataList: function(parameter, forecast, minTimestepValue = 0, maxTimestepValue = Infinity, clip){
            var isVector         = parameter.type == 'vector',
                scaleParameter   = isVector ? parameter.speed_direction[0] : parameter,
                scaleParameterId = scaleParameter.id,
                dirParameterId   = isVector ? parameter.speed_direction[1].id : null,

                unit     = scaleParameter.unit,
                toUnit   = this.getDisplayUnit(scaleParameter),

                result   = [],
                dataList = forecast ? this.forecastDataList : this.observationDataList; //[]{timestamp:STRING, NxPARAMETER_ID: FLOAT}

            $.each(dataList, function(index, dataSet){
                var timestepValue = moment(dataSet.timestamp).valueOf(),
                    value         = dataSet[scaleParameterId];


                if ((timestepValue >= minTimestepValue) && (timestepValue <= maxTimestepValue )){
                    //timestepValue inside min-max-range
                    var add = true;
                    if (clip){
                        //Check if timestepValue is OUTSIDE clip[0] - clip[1]
                        add = (timestepValue <= clip[0]) || (timestepValue >= clip[1]);
                    }
                    if (add){
                        value = nsParameter.convert(value, unit, toUnit);
                        result.push([
                            timestepValue,
                            isVector ? [value, dataSet[dirParameterId]] : value
                        ]);
                    }
                }
            });
            result.sort(function(timestampValue1, timestampValue2){ return timestampValue1[0] - timestampValue2[0];});
            return result;
        }

    });



}(jQuery, this.i18next, this.moment, this, document));


