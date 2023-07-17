/********************************************************************************************************************************************************
This script for Sales Order. Restlet para ejecutar tarea función actualizar stock.
/******************************************************************************************************************************************************** 
File Name: TS_RS_Integration_VTEX.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 22/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(['N/log', 'N/task'], (log, task) => {

    const _get = (context) => {
        if (context.taskAction == 'price') {
            try {
                let mrTask = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    scriptId: 'customscript_ts_ss_integr_vtex_prices',
                    deploymentId: 'customdeploy_ts_ss_integr_vtex_prices',
                    params: {
                        'custscript_from_execute': 'fromcustom'
                    }
                });
                let mrTaskId = mrTask.submit();
                log.debug('Debug', context.taskAction + '-' + mrTaskId);
                return 'SUCCESS';
            } catch (error) {
                log.error('Error', error);
                return 'INPROGRESS'
            }
        } else {
            try {
                let mrTask = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    scriptId: 'customscript_ts_ss_integrations_vtex',
                    deploymentId: 'customdeploy_ts_ss_integrations_vtex',
                    params: {
                        'custscript_from_execute_stock': 'fromcustom'
                    }
                });
                let mrTaskId = mrTask.submit();
                log.debug('Debug', context.taskAction + '-' + mrTaskId);
                return 'SUCCESS';
            } catch (error) {
                log.error('Error', error);
                return 'INPROGRESS'
            }
        }
    }

    return {
        get: _get
    }
});
