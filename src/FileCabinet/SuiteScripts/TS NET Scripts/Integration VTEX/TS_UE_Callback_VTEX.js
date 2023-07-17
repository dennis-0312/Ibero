/********************************************************************************************************************************************************
This script for Categories (Heriarchy), Sales Order, Item, Stock, Prices
/******************************************************************************************************************************************************** 
File Name: TS_UE_Integration_VTEX.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 17/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/log', 'N/search', 'N/record'], (log, search, record) => {
    const INVOICE = 'invoice';
    const HIERARCHY = 'merchandisehierarchynode';
    const ITEM = 'inventoryitem';
    const ITEM_RECEIPT = 'itemreceipt';
    const SALES_ORDER = 'salesorder';
    const INVENTORY_STATUS_CHANGE = 'inventorystatuschange';
    const CALLBACK_VTEX = 'customrecord_pe_callbacks_vtex';
    const CALLBACK_TYPE_CATEGORY = 1;

    const afterSubmit = (context) => {
        const eventType = context.type;
        if (eventType === context.UserEventType.CREATE) {
            const objRecord = context.newRecord;
            if (objRecord.type == CALLBACK_VTEX) {
                let recordId = objRecord.id;
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let fieldLookUp = search.lookupFields({
                        type: 'customrecord_pe_callbacks_vtex',
                        id: recordId,
                        columns: ['custrecord_pe_callback_type_vtex', 'custrecord_pe_callback_detail']
                    });
                    let callbackType = fieldLookUp.custrecord_pe_callback_type_vtex[0].value;
                    if (callbackType == CALLBACK_TYPE_CATEGORY) {
                        let callbackDeatil = JSON.parse(fieldLookUp.custrecord_pe_callback_detail);
                        let status = callbackDeatil[0].status;
                        if (status == 'Categoría procesada') {
                            let identifier = callbackDeatil[0].identifier;
                            let category_id_vtex = callbackDeatil[0].category_id_vtex;
                            let categoryid = record.submitFields({
                                type: record.Type.MERCHANDISE_HIERARCHY_NODE,
                                id: identifier,
                                values: {
                                    description: category_id_vtex
                                },
                                options: {
                                    enableSourcing: false,
                                    ignoreMandatoryFields: true
                                }
                            });
                            log.debug('Success', 'Category: ' + categoryid + ' updated');
                        }
                    }
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {
                    log.error('Error-afterSubmit', eventType + ' - ' + error);
                }
            }
        }
    }


    return {
        // beforeLoad: beforeLoad,
        afterSubmit: afterSubmit,
        // beforeSubmit: beforeSubmit
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