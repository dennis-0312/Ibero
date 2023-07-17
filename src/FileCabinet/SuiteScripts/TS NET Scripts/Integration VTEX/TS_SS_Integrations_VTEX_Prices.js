
/********************************************************************************************************************************************************
This script for Items (Prices).
/******************************************************************************************************************************************************** 
File Name: TS_SS_Integration_VTEX_Prices.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 22/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
define(['N/log', 'N/search', 'N/https', 'N/runtime'], (log, search, https, runtime) => {

    const URL_PRICE = 'https://saas.getapolo.com/api/v1/products/prices/exec/task/iberolibrerias-products-prices@4f69c98b-3bd2-4d0d-b3dd-fe3404ba0739';
    const ACCEPT = '*/*';
    const TOKEN = '"ApoloToken pk_b5fbb3e6e696abd0"';
    const CONTENT_TYPE = 'application/json';
    const execute = (context) => {
        try {
            const action = runtime.getCurrentScript().getParameter({ name: 'custscript_from_execute' });
            log.debug('Inicio', 'INICIO-----------------------------------------');
            log.debug('Action', action);
            if (action == 'fromcustom') {
                executePriceWS(action);
            } else {
                executePriceWS(0);
            }
        } catch (error) {
            log.debug('Error', error);
        }
    }


    const executePriceWS = (action) => {
        let jsonRequest = new Array();
        let headerObj = new Array();
        let fecha = getFecha();
        log.debug('Date', fecha);
        let searchLoad = search.load({ id: 'customsearch_ib_item_prices_up_search' }); //PE - Item Prices Updated - PRODUCCION
        const searchResultCount = searchLoad.runPaged().count;
        //log.debug('TaskResultCount', searchResultCount);
        if (searchResultCount != 0) {
            const searchResult = searchLoad.run().getRange({ start: 0, end: 1000 });
            if (action == 0) {
                for (let i in searchResult) {
                    let sku = searchResult[i].getValue(searchLoad.columns[0]);
                    let regular_price = searchResult[i].getValue(searchLoad.columns[3]);
                    let dateChange = searchResult[i].getValue(searchLoad.columns[4]);
                    log.debug('Date', dateChange);
                    let hour = dateChange.split(' ');
                    hour = hour[1].split(':');
                    hour = parseInt(hour[0]);
                    //log.debug('DateCondition', fecha.hourFrom + '-' + hour + '-' + fecha.hourTo);
                    if (fecha.hourFrom <= hour && hour < fecha.hourTo) {
                        jsonRequest.push({
                            "sku": sku,
                            "regular_price": parseFloat(regular_price)
                        });
                    }
                }
            } else {
                for (let i in searchResult) {
                    let sku = searchResult[i].getValue(searchLoad.columns[0]);
                    let regular_price = searchResult[i].getValue(searchLoad.columns[3]);
                    jsonRequest.push({
                        "sku": sku,
                        "regular_price": parseFloat(regular_price)
                    });
                }
            }
            let body = JSON.stringify(jsonRequest);
            log.debug('Request', body);
            // log.debug('Length', body.length);
            if (body.length <= 2) {
                log.debug('Debug', 'No se encontraron registros');
            } else {
                headerObj['Accept'] = ACCEPT;
                headerObj['Authorization'] = TOKEN;
                headerObj['Content-Type'] = CONTENT_TYPE;
                let response = https.post({ url: URL_PRICE, body: body, headers: headerObj });
                log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                log.debug('Debug', 'Envío a VETX');
            }
            log.debug('Fin', 'FIN--------------------------------------------');
        }
    }

    const getHour = () => {
        var date = new Date();
        var hour = date.getHours() + 2;
        return hour;
    }


    const getFecha = () => {
        const date = new Date();
        let day = date.getDate();
        let month = date.getMonth() + 1;
        let year = date.getFullYear();



        //var hour = date.getHours() + 2;
        let hourTo = date.getHours() + 2;
        let hourFrom = date.getHours() - 2;
        hourFrom = hourFrom < 0 ? 0 : hourFrom;

        // let minute = date.getMinutes();

        // let horaDesde;
        // let horaHasta;
        // let dia;

        // if (month < 10) {
        //     dia = day + '/' + '0' + month + '/' + year;
        // }
        // else {
        //     dia = day + '/' + month + '/' + year;
        // }

        return {
            'hourFrom': parseInt(hourFrom),
            'hourTo': parseInt(hourTo)
        }

        // if (minute < 10) {
        //     horaDesde = hourFrom + ':' + '0' + minute;
        //     horaHasta = hourTo + ':' + '0' + minute;
        // }
        // else {
        //     horaDesde = hourFrom + ':' + minute;
        //     horaHasta = hourTo + ':' + minute;
        // }

        // return dia + ' ' + hora

        // var date = new Date();
        // var fech = date.toLocaleTimeString(2);
    }

    return {
        execute: execute
    }
});
/********************************************************************************************************************************************************
TRACKING
/********************************************************************************************************************************************************
/* Commit:01
Version: 1.0
Date: 22/05/2022
Author: Dennis Fernández
Description: Creación del script.
========================================================================================================================================================*/
