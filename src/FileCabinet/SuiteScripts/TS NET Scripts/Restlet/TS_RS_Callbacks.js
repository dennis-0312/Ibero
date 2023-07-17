/********************************************************************************************************************************************************
This script for Callbacks. Registro para llevar el control de las respuestas de error de VTEX.
/******************************************************************************************************************************************************** 
File Name: TS_RS_Callbacks.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 23/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(['N/log', 'N/record'], (log, record) => {

    const _get = (context) => {
        return 'Oracle Netsuite Connected - Release 2022.1';
    }


    const _post = (context) => {
        log.debug('Request', context);
        try {
            let objRecord = record.create({
                type: 'customrecord_pe_callbacks_vtex',
                isDynamic: true
            });
            objRecord.setValue({ fieldId: 'custrecord_pe_callback_type_vtex', value: context.transaction });
            objRecord.setValue({ fieldId: 'custrecord_pe_callback_detail', value: JSON.stringify(context.list) });
            let recordId = objRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            log.debug('Record', recordId);
            return 'Oracle Netsuite Connected - Release 2022.1';
        } catch (error) {
            log.error('Error', error);
            return 'Oracle Netsuite Connected - Release 2022.1';
        }
    }

    return {
        get: _get,
        post: _post
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
