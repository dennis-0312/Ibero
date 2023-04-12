/********************************************************************************************************************************************************
This script for Customer (Validación y asignación de datos provenientes del API RUC) 
/******************************************************************************************************************************************************** 
File Name: TS_UE_Customer_Vendor.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 26/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/log', 'N/https', 'N/record'], (log, https, record) => {
    const CUSTOMER = 'customer';
    const VENDOR = 'vendor';
    const TOKEN = '094b9378a57a63fee2fc08792d8a77b6bbc57699';
    const urlDNIMain = 'https://consulta.api-peru.com/api/dni/';
    const urlRUCMain = 'https://consulta.api-peru.com/api/ruc/';
    const PE_Facturacion_Electronica = 2;
    const beforeLoad = (context) => {
        const objRecord = context.newRecord;
        try {
            // objRecord.setValue({ fieldId: 'custentity_psg_ei_entity_edoc_standard', value: PE_Facturacion_Electronica });
            // objRecord.setValue({ fieldId: 'custentity_psg_ei_auto_select_temp_sm', value: true });
        } catch (error) {
            log.error('Error', error);
        }
    }

    const beforeSubmit = (context) => {
        const objRecord = context.newRecord;
        const eventType = context.type;
        if (eventType === context.UserEventType.CREATE) {
            let headerObj = new Array();
            headerObj['Accept'] = '*/*';
            headerObj['Content-Type'] = 'application/json';
            headerObj['Authorization'] = TOKEN;
            let addr1 = '';
            let addr2 = '';
            let city = '';
            let state = '';
            let document_number = '';
            let documentType = ''
            let typeOfPerson = '';
            try {
                let getdatesauto = objRecord.getValue('custentity_pe_crear_cliente_auto');
                let isperson = objRecord.getValue('isperson');
                if (getdatesauto == true) {
                    document_number = objRecord.getValue('custentity_pe_document_number');
                    if (isperson == 'F') {
                        let response = https.get({ url: urlRUCMain + document_number, headers: headerObj });
                        let body = JSON.parse(response.body);
                        let success = body.success;
                        if (success == true) {
                            var companyname = body.data.nombre_o_razon_social;
                          	companyname = companyname.substr(0, 83);
                            let dpd = body.data.dpd;
                            try {
                                dpd = dpd.split(' - ');
                                addr2 = dpd[0];
                                city = dpd[1];
                                state = dpd[2];
                            } catch (error) {
                                log.error('ErrorDPD', 'DPD Vacío');
                            }
                            addr1 = body.data.direccion;
                            documentType = 4;
                            typeOfPerson = 2;
                            objRecord.setValue({ fieldId: 'companyname', value: companyname });
                        }
                    } else {
                        try {
                            let response = https.get({ url: urlDNIMain + document_number, headers: headerObj });
                            let body = JSON.parse(response.body);
                            let success = body.success;
                            if (success == true) {
                                let firstname = body.data.nombres;
                                let lastname = body.data.apellido_paterno + ' ' + body.data.apellido_materno;
                                addr1 = body.data.direccion;
                                addr2 = body.data.ubigeo_direccion_distrito;
                                city = body.data.ubigeo_direccion_provincia;
                                state = body.data.ubigeo_direccion_departamento;
                                documentType = 2;
                                typeOfPerson = 1;
                                objRecord.setValue({ fieldId: 'firstname', value: firstname });
                                objRecord.setValue({ fieldId: 'lastname', value: lastname });
                                objRecord.setValue({ fieldId: 'companyname', value: firstname + ' ' + lastname });

                            }
                        } catch (error) {
                            log.error('ErrorURL', error);
                        }
                    }
                    objRecord.setValue({ fieldId: 'custentity_pe_document_type', value: documentType });
                    objRecord.setValue({ fieldId: 'custentity_pe_type_of_person', value: typeOfPerson });
                    objRecord.setValue({ fieldId: 'custentity_pe_flag_direccion_api_ruc', value: addr1 });
                    objRecord.setValue({ fieldId: 'custentity_pe_flag_distrito_api_ruc', value: addr2 });
                    objRecord.setValue({ fieldId: 'custentity_pe_flag_provincia_api_ruc', value: city });
                    objRecord.setValue({ fieldId: 'custentity_pe_flag_departamento_api_ruc', value: state });
                    objRecord.setValue({ fieldId: 'custentity_pe_flag_tax_number_api_ruc', value: document_number });
                } else {
                    if (isperson == 'T') {
                        let firstname = objRecord.getValue('firstname');
                        let lastname = objRecord.getValue('lastname');
                        objRecord.setValue({ fieldId: 'companyname', value: firstname + ' ' + lastname });
                    }
                }
            } catch (error) {
                log.error('Error-beforeSubmit', error);
            }
        }
    }


    const afterSubmit = (context) => {
        const objRecord = context.newRecord;
        const eventType = context.type;
        let entity = '';
        if (eventType === context.UserEventType.CREATE) {
            try {
                let recordId = objRecord.id;
                let subRecordAddress = '';
                if (objRecord.type == CUSTOMER) {
                    subRecordAddress = record.load({ type: record.Type.CUSTOMER, id: recordId, isDynamic: true });
                    entity = 'Customer';
                } else {
                    subRecordAddress = record.load({ type: record.Type.VENDOR, id: recordId, isDynamic: true });
                    entity = 'Vendor';
                }
                let getdatesauto = subRecordAddress.getValue('custentity_pe_crear_cliente_auto');
                if (getdatesauto == true) {
                    let number = subRecordAddress.getValue('custentity_pe_flag_tax_number_api_ruc');
                    let addr1 = subRecordAddress.getValue('custentity_pe_flag_direccion_api_ruc');
                    let addr2 = subRecordAddress.getValue('custentity_pe_flag_distrito_api_ruc');
                    let city = subRecordAddress.getValue('custentity_pe_flag_provincia_api_ruc');
                    let state = subRecordAddress.getValue('custentity_pe_flag_departamento_api_ruc');
                    subRecordAddress.setValue({ fieldId: 'vatregnumber', value: number });
                    subRecordAddress.setValue({ fieldId: 'custentity_psg_ei_entity_edoc_standard', value: PE_Facturacion_Electronica });
                    subRecordAddress.setValue({ fieldId: 'custentity_psg_ei_auto_select_temp_sm', value: true });
                    subRecordAddress.selectNewLine({ sublistId: 'addressbook' });
                    let myAddressSubRecord = subRecordAddress.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress' });
                    myAddressSubRecord.setValue({ fieldId: 'addr1', value: addr1 });
                    myAddressSubRecord.setValue({ fieldId: 'addr2', value: addr2 });
                    myAddressSubRecord.setValue({ fieldId: 'city', value: city });
                    try {
                        myAddressSubRecord.setValue({ fieldId: 'state', value: state });
                    } catch (error) {

                    }
                    subRecordAddress.commitLine({ sublistId: 'addressbook' });
                    let result = subRecordAddress.save({ enableSourcing: true, ignoreMandatoryFields: true });
                    log.debug('Result', entity + 'Id: ' + result);
                }
                // else {
                //     subRecordAddress.setValue({ fieldId: 'custentity_psg_ei_entity_edoc_standard', value: PE_Facturacion_Electronica });
                //     subRecordAddress.setValue({ fieldId: 'custentity_psg_ei_auto_select_temp_sm', value: true });
                //     let result = subRecordAddress.save({ enableSourcing: true, ignoreMandatoryFields: true });
                //     log.debug('Result', result);
                // }
            } catch (error) {
                log.error('Error-afterSubmit', error);
            }
        }

    }

    return {
        //beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
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
