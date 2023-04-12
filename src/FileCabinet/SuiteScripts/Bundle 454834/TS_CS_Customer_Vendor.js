/********************************************************************************************************************************************************
This script for Customer (Validación para activar check y saber si disparará el API RUC) 
/******************************************************************************************************************************************************** 
File Name: TS_CS_Customer_Vendor.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 26/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
define(['N/currentRecord', 'N/search', 'N/ui/dialog'], (currentRecord, search, dialog) => {
    const CUSTOMER = 'customer';
    const VENDOR = 'vendor';
    const CASH_SALE = 'cashsale';
    let idCliente = 0;
    const pageInit = (scriptContext) => {
        try {

            var isNew = scriptContext.currentRecord.isNew;
            if (isNew) {
                scriptContext.currentRecord.setValue({ fieldId: 'companyname', value: 'Por generar' });
                scriptContext.currentRecord.setValue({ fieldId: 'firstname', value: 'Por generar' });
                scriptContext.currentRecord.setValue({ fieldId: 'lastname', value: 'Por generar' });
            }

        } catch (e) {
            console.log('Error en pageInit', e);
        }
    }

    const saveRecord = (scriptContext) => {
        try {
            let recordType = scriptContext.currentRecord.type;
            console.log(recordType);
            if (recordType == CUSTOMER || recordType == VENDOR) {
                let document_number = scriptContext.currentRecord.getValue('custentity_pe_document_number');
                let getdatesauto = scriptContext.currentRecord.getValue('custentity_pe_crear_cliente_auto');
                if (getdatesauto == true) {
                    let isperson = scriptContext.currentRecord.getValue('isperson');
                    let returnValidate = validateLength(isperson, document_number);
                    if (returnValidate == 1) {
                        let existCustomer = getExistCustomer(document_number, recordType);
                        if (existCustomer == 1) {
                            let options = { title: 'Información', message: 'El cliente ya se encuentra registrado.' }
                            // scriptContext.currentRecord.setValue({ fieldId: 'custbody_pe_number', value: idCliente, ignoreFieldChange: true, forceSyncSourcing: true });
                            // window.close()
                            // window.location.replace("https://6785603-sb1.app.netsuite.com/app/accounting/transactions/cashsale.nl?whence=&cf=127&entity=408&nexus=1&custpage_4601_appliesto=&subsidiary=1&manual_reload=T")
                            dialog.alert(options);
                            return false;
                        } else {
                            //alert('Se creó');
                            return true;
                        }
                    }
                } else {
                    scriptContext.currentRecord.setValue({ fieldId: 'vatregnumber', value: document_number, ignoreFieldChange: true, forceSyncSourcing: true });
                    let document_type = scriptContext.currentRecord.getText('custentity_pe_document_type');
                    let type_of_person = scriptContext.currentRecord.getText('custentity_pe_type_of_person');
                    if (document_type.length != 0 && type_of_person.length != 0) {
                        //alert('Se creo');
                        return true;
                    } else {
                        let options = { title: 'Información', message: 'Los campos tipo documento y tipo persona son obligatorios.' }
                        dialog.alert(options);
                        return false;
                    }
                }
            }
            // else {
            //     scriptContext.currentRecord.setValue({ fieldId: 'custbody_pe_number', value: idCliente, ignoreFieldChange: true, forceSyncSourcing: true });
            // }

        } catch (error) {
            console.log('Error-saveRecord: ' + error);
        }
    }

    const fieldChanged = (scriptContext) => {
        try {
            let getdatesauto = scriptContext.currentRecord.getValue('custentity_pe_crear_cliente_auto');
            if (getdatesauto == true) {
                let document_number = scriptContext.currentRecord.getValue('custentity_pe_document_number');
                if (document_number.length != 0) {
                    scriptContext.currentRecord.setValue({ fieldId: 'companyname', value: 'Por generar', ignoreFieldChange: true, forceSyncSourcing: true });
                    scriptContext.currentRecord.setValue({ fieldId: 'firstname', value: 'Por generar', ignoreFieldChange: true, forceSyncSourcing: true });
                    scriptContext.currentRecord.setValue({ fieldId: 'lastname', value: 'Por generar', ignoreFieldChange: true, forceSyncSourcing: true });
                }
            }
        } catch (error) {
            console.log('Error-fieldChanged: ' + error);
        }
    }


    const getExistCustomer = (document, recordType) => {
        let mySearch = '';
        if (recordType == CUSTOMER) {
            mySearch = search.load({ id: 'customsearch_pe_customer_document_exist' }); //TODO PE - Customer Document Exist - PRODUCCION
        } else {
            mySearch = search.load({ id: 'customsearch_pe_vendor_document_exist' }); //TODO PE - Vendor Document Exist - PRODUCCION
        }

        let filters = mySearch.filters;
        const filterOne = search.createFilter({ name: 'vatregnumber', operator: search.Operator.STARTSWITH, values: document });
        filters.push(filterOne);
        let searchResultCount = mySearch.runPaged().count;
        if (searchResultCount != 0) {
            return 1;
        } else {
            return 0;
        }
    }

    const validateLength = (isperson, document) => {
        if (isperson == 'F') {
            if (document.length != 11) {
                let options = { title: 'Información', message: 'El número de documento debe contener 11 caracteres.' }
                dialog.alert(options);
                return false;
            }
        } else {
            if (document.length != 8) {
                let options = { title: 'Información', message: 'El número de documento debe contener 8 caracteres.' }
                dialog.alert(options);
                return false;
            }
        }
        return 1;
    }

    return {
        pageInit: pageInit,
        saveRecord: saveRecord,
        fieldChanged: fieldChanged
    }
});
/*********************************************************************************************************************************************
TRACKING
/*********************************************************************************************************************************************
Commit:01
Version: 1.0
Date: 25/05/2022
Author: Dennis Fernández
Description: Creación del script en SB.
==============================================================================================================================================*/