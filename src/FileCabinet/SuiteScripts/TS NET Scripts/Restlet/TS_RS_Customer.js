/*********************************************************************************************************************************************
This script for Customer (Servicio Rest para creación de clientes) 
/*********************************************************************************************************************************************
File Name: TS_RS_Customer.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 04/05/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
=============================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType Restlet

 */
define(['N/log', 'N/record', 'N/search'], (log, record, search) => {

    const _get = (requestBody) => {
        return 'Oracle Netsuite Connected - Release 2022.1';
    }

    const _post = (requestBody) => {
        log.debug({ title: 'Request', details: requestBody });
        const PE_Facturacion_Electronica = 2;
        if (typeof requestBody.action != 'undefined') {
            //REQUEST PARAMS ACTION
            let id = requestBody.id;
            let action = requestBody.action;
            let updateCus = updateCustomer(action, id, requestBody);
            return updateCus;
        } else {
            try {
                let response = '';

                //BODY
                let isperson = requestBody.isperson;
                let companyname = requestBody.companyname;
                let parent = requestBody.parent;
                let lastname = requestBody.lastname;
                let firstname = requestBody.firstname;
                let vatregnumber = requestBody.vatregnumber
                let existCustomer = getExistCustomer(vatregnumber);
                if (existCustomer != 0) {
                    log.debug('DebugExist', 'Cliente: ' + vatregnumber + ' ya existe');
                    return { id: existCustomer, success: 1 }
                }

                // const custentity_pe_code_type_person = requestBody.custentity_pe_code_type_person;
                let email = requestBody.email;
                let phone = requestBody.phone;
                let subsidiary = requestBody.principalsubsidiary;
                let custentity_pe_document_type = requestBody.custentity_pe_document_type;
                let custentity_pe_type_of_person = requestBody.custentity_pe_type_of_person;

                //ADDRESS
                let defaultbilling = requestBody.addressBook.items[0].defaultbilling;
                let defaultshipping = requestBody.addressBook.items[0].defaultshipping;
                let addr1 = requestBody.addressBook.items[0].addressBookAddress.addr1;
                let addr2 = requestBody.addressBook.items[0].addressBookAddress.addr2;
                let addr3 = requestBody.addressBook.items[0].addressBookAddress.addr3;
                let city = requestBody.addressBook.items[0].addressBookAddress.city;
                let state = requestBody.addressBook.items[0].addressBookAddress.state;
                let country = requestBody.addressBook.items[0].addressBookAddress.country;
                // let custrecord_pe_ubigeo = requestBody.addressBook.items[0].addressBookAddress.custrecord_pe_ubigeo;

                //CREATE RECORD
                let objRecord = record.create({ type: 'customer', isDynamic: true });
                objRecord.setValue({ fieldId: 'custentity_pe_crear_cliente_auto', value: false });
                objRecord.setValue({ fieldId: 'custentity_pe_document_number', value: vatregnumber });
                //objRecord.setValue({ fieldId: 'name', value: 'Company' });
                objRecord.setValue({ fieldId: 'isperson', value: isperson });
                objRecord.setValue({ fieldId: 'companyname', value: companyname });
                if (typeof parent != "undefined") {
                    objRecord.setValue({ fieldId: 'parent', value: parent });
                }
                objRecord.setValue({ fieldId: 'lastname', value: lastname });
                objRecord.setValue({ fieldId: 'firstname', value: firstname });
                objRecord.setValue({ fieldId: 'vatregnumber', value: vatregnumber });
                if (typeof email != "undefined") {
                    objRecord.setValue({ fieldId: 'email', value: email });
                }
                objRecord.setValue({ fieldId: 'phone', value: phone });
                objRecord.setValue({ fieldId: 'subsidiary', value: subsidiary });
                objRecord.setValue({ fieldId: 'custentity_pe_document_type', value: custentity_pe_document_type });
                objRecord.setValue({ fieldId: 'custentity_pe_type_of_person', value: custentity_pe_type_of_person });
                objRecord.setValue({ fieldId: 'custentity_psg_ei_entity_edoc_standard', value: PE_Facturacion_Electronica });
                objRecord.setValue({ fieldId: 'custentity_psg_ei_auto_select_temp_sm', value: true });
                response = objRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });

                //OPEN RECORD AND CREATE ADDRESS
                let subRecordAddress = record.load({ type: record.Type.CUSTOMER, isDynamic: true, id: response });
                subRecordAddress.selectNewLine({ sublistId: 'addressbook' });

                //SECOND RECORD - ADDRESS
                //let ubigeo = getUbigeo(custrecord_pe_ubigeo);
                let myAddressSubRecord = subRecordAddress.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress' });
                //myAddressSubRecord.setValue({ fieldId: 'country', value: country });
                myAddressSubRecord.setValue({ fieldId: 'addr1', value: addr1 });
                myAddressSubRecord.setValue({ fieldId: 'addr2', value: addr2 });
                myAddressSubRecord.setValue({ fieldId: 'addr3', value: addr3 });
                myAddressSubRecord.setValue({ fieldId: 'city', value: city });
                myAddressSubRecord.setValue({ fieldId: 'state', value: state });
                subRecordAddress.commitLine({ sublistId: 'addressbook' });
                responseAddress = subRecordAddress.save({ enableSourcing: false, ignoreMandatoryFields: true });

                log.debug('Create', 'id: ' + responseAddress + ' - Success');
                return { id: responseAddress.toString(), success: 1 }
            } catch (error) {
                log.error('error', error);
                return error.message;
            }
        }
    }


    const updateCustomer = (action, document, requestBody) => {
        if (action == 'update') {
            try {
                //REQUEST PARAMS UPDATE
                let isperson = requestBody.body.isperson;
                let companyname = requestBody.body.companyname;
                let parent = requestBody.body.parent;
                let subsidiary = requestBody.body.principalsubsidiary;
                let lastname = requestBody.body.lastname;
                let firstname = requestBody.body.firstname;
                let vatregnumber = requestBody.body.vatregnumber
                let email = requestBody.body.email;
                let phone = requestBody.body.phone;
                let custentity_pe_document_type = requestBody.body.custentity_pe_document_type;
                let custentity_pe_type_of_person = requestBody.body.custentity_pe_type_of_person;

                //UPDATE RECORD
                let existCustomer = getExistCustomer(document);
                let objRecord = record.load({ type: record.Type.CUSTOMER, id: existCustomer, isDynamic: true });

                // objRecord.setValue({ fieldId: 'name', value: 'Company' });
                objRecord.setValue({ fieldId: 'isperson', value: isperson });
                if (typeof parent != "undefined") {
                    objRecord.setValue({ fieldId: 'parent', value: parent });
                }
                objRecord.setValue({ fieldId: 'subsidiary', value: subsidiary });
                objRecord.setValue({ fieldId: 'companyname', value: companyname });
                objRecord.setValue({ fieldId: 'lastname', value: lastname });
                objRecord.setValue({ fieldId: 'firstname', value: firstname });
                objRecord.setValue({ fieldId: 'vatregnumber', value: vatregnumber });
                if (typeof email != "undefined") {
                    objRecord.setValue({ fieldId: 'email', value: email });
                }
                objRecord.setValue({ fieldId: 'phone', value: phone });
                objRecord.setValue({ fieldId: 'custentity_pe_document_type', value: custentity_pe_document_type });
                objRecord.setValue({ fieldId: 'custentity_pe_type_of_person', value: custentity_pe_type_of_person });

                //UPDATE ADDRESS RECORD
                let addressBook = requestBody.body.addressBook;

                if (typeof addressBook != "undefined") {
                    //SUBLIST ADDRESSBOOK
                    let defaultbilling = requestBody.body.addressBook.items[0].defaultbilling;
                    let defaultshipping = requestBody.body.addressBook.items[0].defaultshipping;
                    let addressBookAddress = requestBody.body.addressBook.items[0].addressBookAddress;

                    if (typeof addressBookAddress != "undefined") {
                        let addr1 = requestBody.body.addressBook.items[0].addressBookAddress.addr1;
                        let addr2 = requestBody.body.addressBook.items[0].addressBookAddress.addr2;
                        let addr3 = requestBody.body.addressBook.items[0].addressBookAddress.addr3;
                        let city = requestBody.body.addressBook.items[0].addressBookAddress.city;
                        let state = requestBody.body.addressBook.items[0].addressBookAddress.state;

                        //OPEN RECORD AND UPDATE ADDRESS
                        //let subRecordAddress = record.load({ type: record.Type.CUSTOMER, id: id, isDynamic: true });
                        objRecord.selectLine({ sublistId: 'addressbook', line: 0 });

                        //SECOND RECORD - ADDRESS
                        let myAddressSubRecord = objRecord.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress', line: 0 });
                        myAddressSubRecord.setValue({ fieldId: 'addr1', value: addr1 });
                        myAddressSubRecord.setValue({ fieldId: 'addr2', value: addr2 });
                        myAddressSubRecord.setValue({ fieldId: 'addr3', value: addr3 });
                        myAddressSubRecord.setValue({ fieldId: 'city', value: city });
                        myAddressSubRecord.setValue({ fieldId: 'state', value: state });
                        objRecord.commitLine({ sublistId: 'addressbook' });
                        let subresponse = objRecord.save({
                            enableSourcing: false,
                            ignoreMandatoryFields: true
                        });

                        log.debug('Update', 'Record: ' + subresponse + '- Success');
                        return { id: subresponse, success: 1 };
                    }
                } else {
                    let response = objRecord.save();
                    log.debug('Update', 'Record: ' + response);
                    return { id: response, success: 1 };
                }
            }
            catch (error) {
                log.error('error', error);
                return error.message;
            }
        } else if (action == 'delete') {
            try {
                let existCustomer = getExistCustomer(document);
                let response = record.submitFields({ type: record.Type.CUSTOMER, id: existCustomer, values: { isinactive: true } });
                log.debug({ title: 'Delete', details: response });
                return { id: response, success: 1 };
            }
            catch (error) {
                log.error('error', error);
                return error.message;
            }
        }

    }


    // const getUbigeo = (cod_ubigeo) => {
    //     var mySearch = search.create({
    //         type: 'customrecord_pe_ubigeo',
    //         columns: ['internalid', 'name', 'custrecord_pe_codigo'],
    //         filters: ['custrecord_pe_codigo', 'is', cod_ubigeo]
    //     });



    //     var searchResult = mySearch.run().getRange({ start: 0, end: 1 });
    //     var internalid = searchResult[0].getValue({ name: 'internalid' });
    //     var name_ubigeo = searchResult[0].getValue({ name: 'name' });
    //     var codigo_ubigeo = searchResult[0].getValue({ name: 'custrecord_pe_codigo' });

    //     return internalid;
    // }


    const getExistCustomer = (document) => {
        let mySearch = search.load({ id: 'customsearch_pe_customer_document_exist' });
        let filters = mySearch.filters;
        const filterOne = search.createFilter({ name: 'vatregnumber', operator: search.Operator.STARTSWITH, values: document });
        filters.push(filterOne);
        let searchResultCount = mySearch.runPaged().count;
        if (searchResultCount != 0) {
            let searchResult = mySearch.run().getRange({ start: 0, end: 1 });
            let internalid = searchResult[0].getValue(mySearch.columns[0]);
            return internalid;
        } else {
            return 0;
        }
    }


    return {
        get: _get,
        post: _post,
        //put: _put
    }
});
/*********************************************************************************************************************************************
TRACKING
/*********************************************************************************************************************************************
Commit:01
Version: 1.0
Date: 31/03/2022
Author: Dennis Fernández
Description: Creación del script en SB.
==============================================================================================================================================*/
