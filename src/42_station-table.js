/****************************************************************************
42_station-table.js

Load and display time-series in a table

****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    window.fcoo = window.fcoo || {};
    var ns = window.fcoo = window.fcoo || {},
        //nsParameter    = ns.parameter = ns.parameter || {},
        nsObservations = ns.observations = ns.observations || {};



    $.valueFormat.add({
        id     : 'NIELS',
        format : function( value/*, options*/ ){
//HER   console.log(value);

            let result = '';
            if (value.obs){
                result = value.obs;
                if (value.for)
                    result += '&nbsp;/&nbsp;';
            }
            if (value.for)
                result += '<em>'+value.for+'</em>';

            return result;
        },
//HER           convert: convertNumber


    });


    /****************************************************************************
    Extend Station with methods for creating and displaying a table
    ****************************************************************************/
    $.extend(nsObservations.Station.prototype, {
        /*****************************************************
        getTableDataList
        Return a {timestampValue}{GROUPID:{for:STRING, obs:STRING}}
        *****************************************************/
        getTableDataList: function(){
            let _this = this,
                groupId = this.observationGroup.id,
                data = this.getDefaultObsAndForecast(),
                result = {};

            ['obsDataList', 'forecastDataListNoObs', 'forecastDataListWithObs'].forEach( (listName, index) => {
                let list = data[listName] || [],
                    isForecast = !!index;
                if (!list) return;
                list.forEach( singleData => {
                    let timestampValue  = singleData[0],
                        timestampMoment = moment(timestampValue),
                        dataSet = _this.getDataSet(timestampMoment, isForecast),
                        row = result[timestampValue] = result[timestampValue] || {timestampValue: timestampValue};

                    row[groupId] = row[groupId] || {};
                    row[groupId][isForecast ? 'for' : 'obs'] = _this.formatDataSet(dataSet, isForecast);
                });
            });


//HER   console.log('this', this);
//HER   console.log('data', data);
//HER   console.log('result', result);

            return result;

        },

        /*****************************************************
        createTable
        *****************************************************/
        createTable: function(){

        },

    });



}(jQuery, this.i18next, this.moment, this, document));


