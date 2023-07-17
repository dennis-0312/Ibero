
/********************************************************************************************************************************************************
This script Stock Items
/******************************************************************************************************************************************************** 
File Name: TS_UE_Integration_VTEX_Stock.js                                                                        
Commit: 02                                                        
Version: 1.0                                                                     
Date: 02/01/2023
ApiVersion: Script 2.1
Enviroment: PR
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
define(['N/log', 'N/search', 'N/https', 'N/runtime'], (log, search, https, runtime) => {

    const URL_STOCK = 'https://saas.getapolo.com/api/v1/products/stock/exec/task/iberolibrerias-products-stock@010578e0-32f0-49ab-a34b-c367678a9a6d';
    const ACCEPT = '*/*';
    const TOKEN = '"ApoloToken pk_b5fbb3e6e696abd0"';
    const CONTENT_TYPE = 'application/json';
    let jsonRequest = new Array();
    let jsonMapping = new Array();
    let jsonContent = new Array();
    const execute = (context) => {
        try {
            let action = runtime.getCurrentScript().getParameter({ name: 'custscript_from_execute_stock' });
            log.debug('Inicio', 'INICIO-----------------------------------------');
            log.debug('Action', action);
            if (action == 'fromcustom') {
                let k = 0
                let searchTransactions = search.load({ id: 'customsearch_pe_item_stock_updated_trans' }); //PE - Item Stock Updated Search Transaction - PRODUCCION
                var searchResultCountTran = searchTransactions.runPaged().count;
                if (searchResultCountTran != 0) {
                    if (searchResultCountTran <= 4000) {

                        searchTransactions.run().each((result) => {
                            let limit = runtime.getCurrentScript().getRemainingUsage(); //! 10 Governance points
                            //log.debug('Limit', limit);
                            if (limit < 500) {
                                log.debug('Finish', 'Limite excedido, envié: ' + k + ' registros de ' + searchResultCountTran);
                                return false;
                            }
                            let internalid = result.getValue(searchTransactions.columns[0]);
                            //let dateChange = result.getValue(searchTransactions.columns[1]);
                            jsonContent.push({ "internalid": internalid });
                            k++;
                            return true;
                        });
                    }

                    //DELETE DUPLICATES============================================================================================================================
                    if (k > 0) {
                        let json = jsonContent.filter((current) => {
                            let exists = !jsonMapping[current.internalid];
                            jsonMapping[current.internalid] = true;
                            return exists;
                        });
                        log.debug('JSON', json);
                        for (let j in json) {
                            let searchLoad = search.load({ id: 'customsearch_ib_location_ecommerce_updat' }); //PE - Item Stock Updated - PRODUCCION
                            let filters = searchLoad.filters;
                            const filterOne = search.createFilter({ name: 'inventorylocation', operator: search.Operator.ANYOF, values: json[j].internalid });
                            filters.push(filterOne);
                            const searchResultCount = searchLoad.runPaged().count;
                            if (searchResultCount != 0) {
                                const searchResult = searchLoad.run().getRange({ start: 0, end: 1000 });
                                for (let i in searchResult) {
                                    const sku = searchResult[i].getValue({ name: "internalid" });
                                    let stock = parseInt(searchResult[i].getValue(searchLoad.columns[4]));
                                    stock = isNaN(stock) == true ? 0 : stock;
                                    const location = searchResult[i].getValue(searchLoad.columns[3]);
                                    jsonRequest.push({
                                        "sku": sku,
                                        "stock_quantity": stock,
                                        "warehouse_id": location
                                    });
                                }
                            }
                        }
                        let body = JSON.stringify(jsonRequest);
                        log.debug('Request', body);
                        executeStockWS(body);
                    }
                }
            } else {
                let k = 0;
                let fecha = getFecha();
                log.debug('Date', fecha);
                let searchTransactions = search.load({ id: 'customsearch_pe_item_stock_updated_trans' }); //PE - Item Stock Updated Search Transaction - PRODUCCION
                var searchResultCountTran = searchTransactions.runPaged().count;
                log.debug('Cantidad de Registros', searchResultCountTran);
                if (searchResultCountTran != 0) {
                    if (searchResultCountTran <= 4000) {
                        searchTransactions.run().each((result) => {
                            let limit = runtime.getCurrentScript().getRemainingUsage(); //! 10 Governance points
                            if (limit < 500) {
                                log.debug('Finish', 'Limite excedido, envié: ' + k + ' registros de ' + searchResultCountTran);
                                return false;
                            }
                            let internalid = result.getValue(searchTransactions.columns[0]);
                            let dateChange = result.getValue(searchTransactions.columns[1]);
                            //log.debug('Date', dateChange);
                            let hour = dateChange.split(' ');
                            hour = hour[1].split(':');
                            hour = parseInt(hour[0]);

                            if (fecha.hourFrom <= hour && hour < fecha.hourTo) {
                                //log.debug('DateCondition', fecha.hourFrom + '-' + hour + '-' + fecha.hourTo);
                                jsonContent.push({ "internalid": internalid });
                            }
                            k++;
                            return true;
                        });
                    } else {
                        log.debug('Limit-Records', 'Hay más de 4000 registros - ' + searchResultCountTran);
                    }

                    //DELETE DUPLICATES============================================================================================================================
                    if (k > 0) {
                        let json = jsonContent.filter((current) => {
                            let exists = !jsonMapping[current.internalid];
                            jsonMapping[current.internalid] = true;
                            return exists;
                        });
                        log.debug('JSON', json);
                        for (let j in json) {
                            let mapping = 0;
                            let searchLoad = search.load({ id: 'customsearch_ib_location_ecommerce_updat' }); //PE - Item Stock Updated - PRODUCCION
                            let filters = searchLoad.filters;
                            const filterOne = search.createFilter({ name: 'inventorylocation', operator: search.Operator.ANYOF, values: json[j].internalid });
                            filters.push(filterOne);
                            const searchResultCount = searchLoad.runPaged().count;
                            log.debug('TaskResultCount', 'Location:' + json[j].internalid + '-' + searchResultCount);
                            if (searchResultCount != 0) {
                                const searchResult = searchLoad.run().getRange({ start: 0, end: 1000 });
                                for (let i in searchResult) {
                                    const sku = searchResult[i].getValue({ name: "internalid" });
                                    let stock = parseInt(searchResult[i].getValue(searchLoad.columns[4]));
                                    stock = isNaN(stock) == true ? 0 : stock;
                                    const location = searchResult[i].getValue(searchLoad.columns[3]);
                                    const lastQuantityAviaChange = searchResult[i].getValue(searchLoad.columns[2]);
                                    //log.debug('lastQuantityAviaChange', lastQuantityAviaChange);
                                    let hour = lastQuantityAviaChange.split(' ');
                                    hour = hour[1].split(':');
                                    hour = parseInt(hour[0]);
                                    if (fecha.hourFrom <= hour && hour < fecha.hourTo) {
                                        //log.debug('DateConditionAC', fecha.hourFrom + '-' + hour + '-' + fecha.hourTo);
                                        jsonRequest.push({
                                            "sku": sku,
                                            "stock_quantity": stock,
                                            "warehouse_id": location
                                        });
                                        mapping++
                                    }
                                }
                                log.debug('mapping===========================', mapping);
                            }
                        }
                        let body = JSON.stringify(jsonRequest);
                        log.debug('Request', body);
                        executeStockWS(body);
                    }
                }
            }
        } catch (error) {
            log.debug('Error', error);
        }
    }

    const executeStockWS = (body) => {
        let headerObj = new Array();
        headerObj['Accept'] = ACCEPT;
        headerObj['Authorization'] = TOKEN;
        headerObj['Content-Type'] = CONTENT_TYPE;
        let response = https.post({ url: URL_STOCK, body: body, headers: headerObj });
        log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
        log.debug('Fin', 'FIN--------------------------------------------');
    }


    const getFecha = () => {
        const date = new Date();
        let day = date.getDate();
        let month = date.getMonth() + 1;
        let year = date.getFullYear();

        //var hour = date.getHours() + 2;
        let hourTo = date.getHours() + 3;
        let hourFrom = date.getHours() - 1;
        hourFrom = hourFrom < 0 ? 0 : hourFrom;

        return {
            'hourFrom': parseInt(hourFrom),
            'hourTo': parseInt(hourTo)
        }
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
Date: 17/05/2022
Author: Dennis Fernández
Description: Creación del script.
========================================================================================================================================================*/
/* Commit:02
Version: 1.0
Date: 02/01/2023
Author: Dennis Fernandez.
Description: Se agrega función getFeach().
========================================================================================================================================================*/
