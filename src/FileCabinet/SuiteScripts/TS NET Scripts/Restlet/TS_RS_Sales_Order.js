/*********************************************************************************************************************************************
This script for Sales Order (Servicio Rest para emisión de ordenes de venta) 
/*********************************************************************************************************************************************
File Name: TS_RS_Sales_Order.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 31/03/2022
ApiVersion: Script 2.1
Enviroment: SB
Governance points: N/A
=============================================================================================================================================*/
/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(['N/log', 'N/search', 'N/record'], (log, search, record) => {

    const _get = (context) => {
        // let lookUpTaxCode = search.lookupFields({ type: search.Type.SALES_TAX_ITEM, id: 6, columns: ['internalid', 'rate'] });
        // //og.debug('TaxCode', fieldLookUp);
        // log.debug('TaxCode', lookUpTaxCode.internalid[0].value + ' - ' + lookUpTaxCode.rate);
        // try {
        //     let line = 0;
        //     let subRecordAddress = record.load({ type: record.Type.CUSTOMER, isDynamic: true, id: 510 });
        //     let objSublist = subRecordAddress.getLineCount({ sublistId: 'addressbook' });
        //     line = parseInt(objSublist) - 1;
        //     let id = subRecordAddress.getSublistValue({ sublistId: 'addressbook', fieldId: 'id', line: line });

        //     log.debug('objSublist', id);
        // } catch (error) {
        //     log.debug('Error-GET', error);
        // }
        return 'Oracle Netsuite Connected - Release 2022.1';
    }

    const _post = (context) => {
        const start = Date.now();
        log.debug('Request', context);
        const HOME_DELIVERY = 337;
        const IL_HOME_DELIVERY = 1;
        const STORE_PICKUP = 338;
        const STATUS_PAGADO = 1;

        try {
            let customer = context.customerid;
            let items = context.items;
            let department = context.department;
            let clase = context.class;
            let location = context.location;
            let shipmethod = context.shipmethod;
            //let deliverymethod = '';
            let subRecordAddress = '';

            // CREATION ORDER RECORD
            let objRecord = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });

            //PRIMARY INFORMATION
            objRecord.setValue({ fieldId: 'entity', value: customer }); //* //REQUEST
            objRecord.setValue({ fieldId: 'trandate', value: new Date(context.date) });//* //REQUEST
            objRecord.setValue({ fieldId: 'otherrefnum', value: context.op });//*  //REQUEST
            objRecord.setValue({ fieldId: 'memo', value: context.nota }); //REQUEST
            objRecord.setValue({ fieldId: 'custbody_pe_status_ov', value: STATUS_PAGADO });

            //SALES INFORMATION
            objRecord.setValue({ fieldId: 'salesrep', value: context.salesrep }); // REQUEST

            //CLASSIFICATION
            objRecord.setValue({ fieldId: 'department', value: department });//* //REQUEST
            objRecord.setValue({ fieldId: 'class', value: clase });//* //REQUEST
            objRecord.setValue({ fieldId: 'location', value: location });//* //REQUEST

            //SHIPPING
            //objRecord.setValue({ fieldId: 'shipdate', value: new Date(context.shipdate) });//REQUEST
            objRecord.setValue({ fieldId: 'custbody_il_fecha_envio', value: new Date(context.shipdate) });//REQUEST

            //BILLING
            //objRecord.setValue({ fieldId: 'terms', value: context.terms });//REQUEST
            //objRecord.setValue({ fieldId: 'paymentmethod', value: context.paymentmethod });//REQUEST
            objRecord.setValue({ fieldId: 'custbody_il_metodo_pago', value: context.paymentmethod });//REQUEST

            //DELIVERY METHOD
            //objRecord.setValue({ fieldId: 'shipmethod', value: shipmethod });//REQUEST

            // deliverymethod = shipmethod == HOME_DELIVERY ? 1 : 2;
            objRecord.setValue({ fieldId: 'custbody_il_metodo_entrega', value: shipmethod });//REQUEST
            objRecord.setValue({ fieldId: 'custbody_il_codigo_cupon', value: context.couponcode });//REQUEST


            //?: PROCCESS TYPE DELIVERY METHOD =======================================================================================================
            if (shipmethod == IL_HOME_DELIVERY) {
                objRecord.setValue({ fieldId: 'custbody_il_quien_recibe', value: context.receiver });//REQUEST

                //ADDRESS
                let defaultbilling = context.addressBook.items[0].defaultbilling;
                let defaultshipping = context.addressBook.items[0].defaultshipping;
                let addr1 = context.addressBook.items[0].addressBookAddress.addr1;
                let addr2 = context.addressBook.items[0].addressBookAddress.addr2;
                let addr3 = context.addressBook.items[0].addressBookAddress.addr3;
                let city = context.addressBook.items[0].addressBookAddress.city;
                let state = context.addressBook.items[0].addressBookAddress.state;
                //let country = context.addressBook.items[0].addressBookAddress.country;

                subRecordAddress = record.load({ type: record.Type.CUSTOMER, isDynamic: true, id: customer });
                // subRecordAddress.setValue({ fieldId: 'defaultbilling', value: true });
                // subRecordAddress.setValue({ fieldId: 'defaultbilling', value: true });
                subRecordAddress.selectNewLine({ sublistId: 'addressbook' });
                let myAddressSubRecord = subRecordAddress.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress' });
                //myAddressSubRecord.setValue({ fieldId: 'country', value: country });
                myAddressSubRecord.setValue({ fieldId: 'addr1', value: addr1 });
                myAddressSubRecord.setValue({ fieldId: 'addr2', value: addr2 });
                myAddressSubRecord.setValue({ fieldId: 'addr3', value: addr3 });
                myAddressSubRecord.setValue({ fieldId: 'city', value: city });
                myAddressSubRecord.setValue({ fieldId: 'state', value: state });
                subRecordAddress.commitLine({ sublistId: 'addressbook' });
                subRecordAddress.save();
            } else {
                objRecord.setValue({ fieldId: 'custbody_il_quien_recibe', value: context.receiver });//REQUEST
                objRecord.setValue({ fieldId: 'custbody_il_lista_localizaciones', value: context.store });//REQUEST
            }
            //? ======================================================================================================================================


            //! ACTIVAR PARA FEL==========================================================================================================================
            // if (context.terms == '5') {
            //     objRecord.setValue({ fieldId: 'custbody_pe_ei_forma_pago', value: 1 });//AUTO
            // } else {
            //     objRecord.setValue({ fieldId: 'custbody_pe_ei_forma_pago', value: 2 });//AUTO
            // }
            //!===========================================================================================================================================

            //?: DETAILS ITEMS ========================================================================================================================
            const itemLine = objRecord.selectNewLine({ sublistId: 'item' });
            for (let i in items) {
                let mul = 0;
                let itemid = '';
                let subTotal = -2;
                let taxrate = '';
                let lookUpTaxCode = '';
                log.debug('SKU', items[i].sku);

                itemid = items[i].sku;
                // if (itemid != subTotal) {
                //     itemid = getItemID(items[i].sku);
                //     if (itemid == 0) {
                //         return 'SKU no registrado';
                //     }
                // }

                let taxcode = items[i].taxcode;
                lookUpTaxCode = search.lookupFields({ type: search.Type.SALES_TAX_ITEM, id: taxcode, columns: ['internalid', 'rate'] });
                taxcode = lookUpTaxCode.internalid[0].value;
                taxrate = lookUpTaxCode.rate;
                taxrate = taxrate.replace('%', '');
                if (items[i].quantity != '') {
                    mul = (items[i].rate) * (items[i].quantity);
                } else {
                    mul = items[i].amount;
                }

                log.debug('MUL', mul);

                let grossamt = Number.parseFloat(items[i].grossamt).toFixed(2);

                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: itemid, ignoreFieldChange: false });//* //REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'price', value: items[i].pricelevel, ignoreFieldChange: false }); //REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode', value: taxcode, ignoreFieldChange: false });//* //GET
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxrate1', value: taxrate, ignoreFieldChange: false }); // GET
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: items[i].quantity, ignoreFieldChange: false }); //REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'department', value: department, ignoreFieldChange: false });//* REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'class', value: clase, ignoreFieldChange: false });//* REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: location, ignoreFieldChange: false });//* REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'units', value: items[i].units, ignoreFieldChange: false }); //REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: items[i].description, ignoreFieldChange: false }); //REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: items[i].rate, ignoreFieldChange: true }); //REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'grossamt', value: grossamt, ignoreFieldChange: false });//REQUEST
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: mul, ignoreFieldChange: true }); //* CALCULO
                itemLine.setCurrentSublistValue({ sublistId: 'item', fieldId: 'tax1amt', value: items[i].tax1amt, ignoreFieldChange: false }); //REQUEST
                //custcol_pe_tax_code_id
                //custcol_pe_afec_igv
                objRecord.commitLine({ sublistId: 'item' });
            }
            //? =======================================================================================================================================

            let response = objRecord.save({ ignoreMandatoryFields: true });

            if (shipmethod == HOME_DELIVERY) {
                try {
                    let line = 0;
                    let subRecordAddress = record.load({ type: record.Type.CUSTOMER, isDynamic: true, id: customer });
                    let objSublist = subRecordAddress.getLineCount({ sublistId: 'addressbook' });
                    line = parseInt(objSublist) - 1;
                    let id = subRecordAddress.getSublistValue({ sublistId: 'addressbook', fieldId: 'id', line: line });
                    record.submitFields({
                        type: record.Type.SALES_ORDER,
                        id: response,
                        values: {
                            'shipaddresslist': id
                        },
                        options: {
                            enableSourcing: false,
                            ignoreMandatoryFields: true
                        }
                    });
                } catch (error) {
                    log.error('Error-Address', error);
                }
            }

            let end = Date.now();
            let time = end - start;

            let json = { id: response.toString(), time: time }
            log.debug({ title: 'Response', details: json });
            return json;
        } catch (error) {
            log.error('Error-_post', error);
            return error.message;

        }
    }


    const getItemID = (sku) => {
        let result = 0;
        const searchLoad = search.create({
            type: "item",
            filters:
                [
                    ["type", "anyof", "InvtPart", "Discount", "Service"],
                    "AND",
                    ["upccode", "startswith", sku]
                ],
            columns:
                [
                    search.createColumn({
                        name: "itemid",
                        sort: search.Sort.ASC,
                        label: "Name"
                    }),
                    'internalid'
                ]
        });
        let searchResultCount = searchLoad.runPaged().count;
        if (searchResultCount != 0) {
            let searchResult = searchLoad.run().getRange({ start: 0, end: 1 });
            let column01 = searchResult[0].getValue(searchLoad.columns[1]);
            result = column01;
        }
        return result;
    }


    return {
        get: _get,
        post: _post
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