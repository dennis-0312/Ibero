/********************************************************************************************************************************************************
This script for Sales Order. Client para ejecutar función rest
/******************************************************************************************************************************************************** 
File Name: TS_CS_Integration_VTEX.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date:22/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 *@NModuleScope Public
 */
define(['N/ui/dialog', 'N/https', 'N/url'], (dialog, https, url) => {
    const pageInit = (context) => {
        console.log('Init')
    }

    const executeRestlet = (action) => {
        try {
            const headerObj = { name: 'Accept-Language', value: 'en-us' };
            const urlUpdateStock = url.resolveScript({
                scriptId: 'customscript_ts_rs_integrations_vtex',
                deploymentId: 'customdeploy_ts_rs_integrations_vtex'
            });
            let response = https.get({
                url: urlUpdateStock + '&taskAction=' + action,
                headers: headerObj
            });
            console.log(response.body);
            if (response.body == 'SUCCESS') {
                location.reload();
            } else {
                dialog.alert({ title: 'Información', message: 'Ya existe una tarea de actualización en proceso' });
            }
        } catch (error) {
            console.log(error);
        }
    }




    return {
        pageInit: pageInit,
        executeRestlet: executeRestlet
    }
});
