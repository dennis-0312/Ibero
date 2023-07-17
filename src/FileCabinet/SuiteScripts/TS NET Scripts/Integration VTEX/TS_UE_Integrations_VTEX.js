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
define(['N/log', 'N/search', 'N/https', 'N/record', 'N/task'], (log, search, https, record, task) => {
    const INVOICE = 'invoice';
    const HIERARCHY = 'merchandisehierarchynode';
    const ITEM = 'inventoryitem';
    const ITEM_RECEIPT = 'itemreceipt';
    const SALES_ORDER = 'salesorder';
    const INVENTORY_STATUS_CHANGE = 'inventorystatuschange';
    const NIVEL_1 = 2;
    const URL_CATEGORIAS = 'https://saas.getapolo.com/api/v1/exec/task/iberolibrerias-categories@03b99c0d-88db-4bb3-9dc6-bbe0eefda974';
    const URL_STATUS_SO = 'https://saas.getapolo.com/api/v1/exec/task/iberolibrerias-order-notification@b74383e1-f923-447c-9ad3-46ba1e83db2a';
    const URL_ITEMS = 'https://saas.getapolo.com/api/v1/products/exec/task/iberolibrerias-products@aa983482-a8e7-4ed6-9a72-30f233615ab8';
    const URL_STOCK = 'https://saas.getapolo.com/api/v1/products/stock/exec/task/iberolibrerias-products-stock@010578e0-32f0-49ab-a34b-c367678a9a6d';
    const URL_PRICE = 'https://saas.getapolo.com/api/v1/products/prices/exec/task/iberolibrerias-products-prices@4f69c98b-3bd2-4d0d-b3dd-fe3404ba0739';
    const ACCEPT = '*/*';
    const TOKEN = '"ApoloToken pk_b5fbb3e6e696abd0"';
    const CONTENT_TYPE = 'application/json';
    const STATUS_PAGADO = 1;

    const beforeLoad = (context) => {
        const eventType = context.type;
        if (eventType === context.UserEventType.VIEW) {
            const objRecord = context.newRecord;
            if (objRecord.type == SALES_ORDER || objRecord.type == ITEM || objRecord.type == ITEM_RECEIPT) {
                const form = context.form;
                form.clientScriptFileId = 10113; //PR: 10113 / SB: 4873
                form.addButton({
                    id: 'custpage_btnExecuteRS',
                    label: 'Actualizar Stock',
                    functionName: 'executeRestlet("stock")'
                });
                if (objRecord.type == ITEM) {
                    form.clientScriptFileId = 10113; //PR: 10113 / SB: 4873
                    form.addButton({
                        id: 'custpage_btnExecuteRS2',
                        label: 'Actualizar Precio',
                        functionName: 'executeRestlet("price")'
                    });
                }
            }
        }
    }


    const beforeSubmit = (context) => {
        const eventType = context.type;
        const objRecord = context.newRecord;
        if (objRecord.type == INVENTORY_STATUS_CHANGE) {
            if (eventType === context.UserEventType.DELETE) {
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
                    log.debug('Debug', mrTaskId);
                } catch (error) {
                    log.error('Error-beforeSubmit', eventType + ' - ' + error);
                }
            }
        }
    }


    const afterSubmit = (context) => {
        const eventType = context.type;
        if (eventType === context.UserEventType.CREATE) {
            const objRecord = context.newRecord;
            if (objRecord.type == HIERARCHY) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let parentid = 0;
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let fieldLookUp = search.lookupFields({ type: search.Type.MERCHANDISE_HIERARCHY_NODE, id: recordId, columns: ['name', 'parentnode', 'hierarchylevel'] });

                    if (fieldLookUp.parentnode.length != 0) {
                        if (fieldLookUp.hierarchylevel[0].value != NIVEL_1) {
                            let fieldLookUp2 = search.lookupFields({
                                type: search.Type.MERCHANDISE_HIERARCHY_NODE,
                                id: fieldLookUp.parentnode[0].value,
                                columns: ['description']
                            });
                            parentid = fieldLookUp2.description;
                        }
                    }

                    let body = JSON.stringify([
                        {
                            "category_name": fieldLookUp.name,
                            "category_id": null,
                            "category_parent_id": parseInt(parentid),
                            "category_is_active": true,
                            "category_erp_id": parseInt(recordId)
                        }
                    ]);
                    log.debug('Request', body);
                    headerObj['Accept'] = ACCEPT;
                    headerObj['Authorization'] = TOKEN;
                    headerObj['Content-Type'] = CONTENT_TYPE;
                    let response = https.post({ url: URL_CATEGORIAS, body: body, headers: headerObj });
                    log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {
                    log.error('Error-afterSubmit', eventType + ' - ' + error);
                }
            } else if (objRecord.type == INVOICE) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let soid = '';
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let fieldLookUp = search.lookupFields({ type: search.Type.INVOICE, id: recordId, columns: ['createdfrom'] });
                    log.debug('Sales Order', fieldLookUp);
                    if (typeof fieldLookUp.createdfrom != 'undefined') {
                        soid = fieldLookUp.createdfrom[0].value;
                        let fieldLookUp2 = search.lookupFields({ type: search.Type.SALES_ORDER, id: soid, columns: ['otherrefnum'] });
                        let id = record.submitFields({
                            type: record.Type.SALES_ORDER,
                            id: soid,
                            values: {
                                'custbody_pe_status_ov': 2
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                        let body = JSON.stringify(
                            {
                                "order_code": fieldLookUp2.otherrefnum,
                                "state": "Facturado"
                            }
                        );
                        log.debug('Request', body);
                        if (id == soid) {
                            headerObj['Accept'] = ACCEPT;
                            headerObj['Authorization'] = TOKEN;
                            headerObj['Content-Type'] = CONTENT_TYPE;
                            let response = https.post({ url: URL_STATUS_SO, body: body, headers: headerObj });
                            log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                        }
                    } else {
                        log.debug('Response', 'La factura no tiene una orden de venta asociada o no existe');
                    }
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {

                }
            } else if (objRecord.type == ITEM) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let jsonRequest = new Array();
                let arrayNodes = [];
                let jsonAttributes = {};
                let id = 0;
                let parent = 0;
                let level = 0;
                let description = 0;
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let objRecord = record.load({ type: record.Type.INVENTORY_ITEM, id: recordId, isDynamic: true });
                    let sku = objRecord.getValue({ fieldId: 'upccode' });
                    let displayname = objRecord.getValue({ fieldId: 'displayname' });
                    let salesdescription = objRecord.getValue({ fieldId: 'salesdescription' });
                    let regular_price = objRecord.getSublistValue({ sublistId: 'price1', fieldId: 'price_1_', line: 0 });
                    let hierarchy = objRecord.getSublistValue({ sublistId: 'hierarchyversions', fieldId: 'hierarchynode', line: 1 });
                    log.debug('Debug1', hierarchy);
                    if (hierarchy.length != 0) {
                        let hierarchyNode = getHierarchyNode(hierarchy);
                        log.debug('Debug2', hierarchyNode);
                        parent = hierarchyNode.parent;
                        id = hierarchyNode.id;
                        level = hierarchyNode.level;
                        description = hierarchyNode.description;
                        if (level == 4) {
                            let hierarchyNodeLevel3 = getHierarchyNode(parent);
                            let hierarchyNodeLevel2 = getHierarchyNode(hierarchyNodeLevel3.parent);
                            log.debug('Debug3', hierarchyNodeLevel3);
                            arrayNodes = [parseInt(hierarchyNodeLevel2.description), parseInt(hierarchyNodeLevel3.description), parseInt(description)]
                        } else if (hierarchyNode.level == 3) {
                            let hierarchyNodeLevel3 = getHierarchyNode(parent);
                            arrayNodes = [parseInt(hierarchyNodeLevel3.description), parseInt(description)];
                        } else if (hierarchyNode.level == 2) {
                            arrayNodes = [parseInt(description)]
                        }
                    }
                    log.debug('Debug4', arrayNodes);

                    //Attributes=============================================================================
                    let anioedicion = objRecord.getValue({ fieldId: 'custitemanioedicion' });
                    if (anioedicion.length != 0) {
                        jsonAttributes.Año = [anioedicion]
                    }
                    let idioma = objRecord.getText({ fieldId: 'custitem_ib_idioma' });
                    if (idioma.length != 0) {
                        jsonAttributes.Idioma = [idioma]
                    }
                    let editorial = objRecord.getValue({ fieldId: 'custitem_ib_editorial' });
                    if (editorial.length != 0) {
                        jsonAttributes.Editorial = [editorial]
                    }
                    // let empaste = objRecord.getText({ fieldId: 'custitem_ib_empaste' });
                    // if (empaste.length != 0) {
                    //     jsonAttributes.empaste = [empaste]
                    // }
                    let peso = objRecord.getValue({ fieldId: 'custitemib_peso' });
                    if (peso.length != 0) {
                        jsonAttributes.Peso = [peso.toString()]
                    }
                    let numero_paginas = objRecord.getValue({ fieldId: 'custitem_ib_numero_paginas' });
                    if (numero_paginas.length != 0) {
                        jsonAttributes.Páginas = [String(numero_paginas)]
                    }
                    let dimension_largo = objRecord.getValue({ fieldId: 'custitemib_dimension_largo' });
                    if (dimension_largo.length != 0) {
                        jsonAttributes.Alto = [dimension_largo + 'cm'];
                    }
                    let dimension_ancho = objRecord.getValue({ fieldId: 'custitemib_dimension_ancho' });
                    if (dimension_ancho.length != 0) {
                        jsonAttributes.Ancho = [dimension_ancho + 'cm'];
                    }
                    // let dimension = objRecord.getValue({ fieldId: 'custitem_ib_dimension' });
                    // if (dimension.length != 0) {
                    //     jsonAttributes.dimension = [dimension]
                    // }
                    // let pvp_soles = objRecord.getValue({ fieldId: 'custitemib_pvp_soles' });
                    // if (pvp_soles.length != 0) {
                    //     jsonAttributes.pvp_soles = [pvp_soles]
                    // }
                    let autor = objRecord.getValue({ fieldId: 'custitem_ib_autor' });
                    if (autor.length != 0) {
                        jsonAttributes.Autor = [autor]
                    }
                    // let categoria = objRecord.getText({ fieldId: 'custitemib_categoria' });
                    // if (categoria.length != 0) {
                    //     jsonAttributes.categoria = [categoria]
                    // }
                    // let resenia_libro = objRecord.getValue({ fieldId: 'custitemib_resenia_libro' });
                    // if (resenia_libro.length != 0) {
                    //     jsonAttributes.resenia_libro = [resenia_libro]
                    // }
                    // let subcategoria = objRecord.getText({ fieldId: 'custitemib_subcategoria' });
                    // if (subcategoria.length != 0) {
                    //     jsonAttributes.subcategoria = [subcategoria]
                    // }
                    // let edad = objRecord.getText({ fieldId: 'custitemib_edad' });
                    // if (edad.length != 0) {
                    //     jsonAttributes.edad = [edad]
                    // }
                    // let clases = objRecord.getValue({ fieldId: 'custitemib_clases' });
                    // if (clases.length != 0) {
                    //     jsonAttributes.clases = [clases]
                    // }
                    // let coleccion = objRecord.getValue({ fieldId: 'custitemib_coleccion' });
                    // if (coleccion.length != 0) {
                    //     jsonAttributes.coleccion = [coleccion]
                    // }
                    // let fecha_ingreso = objRecord.getText({ fieldId: 'custitemib_fecha_ingreso' });
                    // if (fecha_ingreso.length != 0) {
                    //     jsonAttributes.fecha_ingreso = [fecha_ingreso]
                    // }
                    // let pais_origen = objRecord.getText({ fieldId: 'custitemib_pais_origen' });
                    // if (pais_origen.length != 0) {
                    //     jsonAttributes.pais_origen = [pais_origen]
                    // }
                    // let origen = objRecord.getText({ fieldId: 'custitemib_origen' });
                    // if (origen.length != 0) {
                    //     jsonAttributes.origen = [origen]
                    // }
                    // let url = objRecord.getValue({ fieldId: 'custitemib_url' });
                    // if (url.length != 0) {
                    //     jsonAttributes.url = [url]
                    // }
                    //SECTION SEND===========================================================================
                    jsonRequest = {
                        "sku": sku,
                        "name": displayname,
                        "short_description": salesdescription,
                        "description": salesdescription,
                        "regular_price": parseFloat(regular_price),
                        "stock_quantity": 0,
                    }
                    hierarchy.length != 0 ? jsonRequest.categories = arrayNodes : log.debug('Hierarchy', 'nothing');
                    jsonRequest.attributes = jsonAttributes;
                    let body = JSON.stringify([jsonRequest]);
                    log.debug('Request', body);
                    headerObj['Accept'] = ACCEPT;
                    headerObj['Authorization'] = TOKEN;
                    headerObj['Content-Type'] = CONTENT_TYPE;
                    let response = https.post({ url: URL_ITEMS, body: body, headers: headerObj });
                    log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {
                    log.error('Error-afterSubmit', eventType + ' - ' + error);
                }
            } else if (objRecord.type == INVENTORY_STATUS_CHANGE) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let jsonRequest = new Array();
                let stock = 0;
                let locationEcommerce = 14;
                let flagSend = 0;
                try {
                    let loadRecord = record.load({ type: record.Type.INVENTORY_STATUS_CHANGE, id: recordId, isDynamic: true });
                    let numLines = loadRecord.getLineCount({ sublistId: 'inventory' });
                    let location = loadRecord.getValue({ fieldId: 'location' });
                    if (numLines != 0 && location == locationEcommerce) {
                        log.debug('Inicio', 'INICIO-----------------------------------------');
                        flagSend = 1;
                        for (let i = 0; i < numLines; i++) {
                            let itemid = loadRecord.getSublistValue({ sublistId: 'inventory', fieldId: 'item', line: i });
                            let recordLoad = record.load({ type: record.Type.INVENTORY_ITEM, id: itemid, isDynamic: true });
                            let sku = recordLoad.getValue({ fieldId: 'itemid' });
                            let saleconversionrate = parseInt(recordLoad.getValue({ fieldId: 'saleconversionrate' }));
                            let stockconversionrate = parseInt(recordLoad.getValue({ fieldId: 'stockconversionrate' }));
                            let quantityavailable = parseInt(recordLoad.getSublistValue({ sublistId: 'locations', fieldId: 'quantityavailable', line: 13 }));
                            stock = quantityavailable / (saleconversionrate / stockconversionrate);
                            jsonRequest.push({
                                "sku": sku,
                                "stock_quantity": stock
                            });
                        }

                    }
                    //SECTION SEND===================================================================================================
                    if (flagSend == 1) {
                        let body = JSON.stringify(jsonRequest);
                        log.debug('Request', body);
                        headerObj['Accept'] = ACCEPT;
                        headerObj['Authorization'] = TOKEN;
                        headerObj['Content-Type'] = CONTENT_TYPE;
                        let response = https.post({ url: URL_STOCK, body: body, headers: headerObj });
                        log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                        log.debug('FIN', 'FIN--------------------------------------------');
                    }
                } catch (error) {
                    log.error('Error-beforeLoad', eventType + ' - ' + error);
                }
            } else if (objRecord.type == SALES_ORDER) {
                let recordId = objRecord.id;
                let salesorder = record.load({ type: record.Type.SALES_ORDER, id: recordId });
                let statusov = salesorder.getValue({ fieldId: 'custbody_pe_status_ov' });
                if (statusov == STATUS_PAGADO) {
                    let department = salesorder.getValue({ fieldId: 'department' });
                    var clase = salesorder.getValue({ fieldId: 'class' });
                    var location = salesorder.getValue({ fieldId: 'location' });
                    var paymentmethod = salesorder.getValue({ fieldId: 'custbody_il_metodo_pago' });
                    let payment = salesorder.getValue({ fieldId: 'total' });
                    let deposit = record.create({ type: record.Type.CUSTOMER_DEPOSIT, isDynamic: true, defaultValues: { salesorder: recordId } });
                    deposit.setValue({ fieldId: 'payment', value: payment });
                    deposit.setValue({ fieldId: 'memo', value: 'Emitido desde E-Commerce' });
                    deposit.setValue({ fieldId: 'department', value: department });//* //REQUEST
                    deposit.setValue({ fieldId: 'class', value: clase });//* //REQUEST
                    deposit.setValue({ fieldId: 'location', value: location });//* //REQUEST
                    deposit.setValue({ fieldId: 'paymentmethod', value: paymentmethod });
                    let result = deposit.save();
                    log.debug('Customer-Deposit', result);
                }
            }
        } else if (eventType === context.UserEventType.EDIT) {
            const objRecord = context.newRecord;
            if (objRecord.type == HIERARCHY) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let parentid = 0;
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let fieldLookUp = search.lookupFields({ type: search.Type.MERCHANDISE_HIERARCHY_NODE, id: recordId, columns: ['name', 'parentnode', 'hierarchylevel', 'description'] });

                    if (fieldLookUp.parentnode.length != 0) {
                        if (fieldLookUp.hierarchylevel[0].value != NIVEL_1) {
                            let fieldLookUp2 = search.lookupFields({
                                type: search.Type.MERCHANDISE_HIERARCHY_NODE,
                                id: fieldLookUp.parentnode[0].value,
                                columns: ['description']
                            });
                            parentid = fieldLookUp2.description;
                        }
                    }

                    let body = JSON.stringify([
                        {
                            "category_name": fieldLookUp.name,
                            "category_id": parseInt(fieldLookUp.description),
                            "category_parent_id": parseInt(parentid),
                            "category_is_active": true,
                            "category_erp_id": parseInt(recordId)
                        }
                    ]);
                    log.debug('Request', body);
                    headerObj['Accept'] = ACCEPT;
                    headerObj['Authorization'] = TOKEN;
                    headerObj['Content-Type'] = CONTENT_TYPE;
                    let response = https.post({ url: URL_CATEGORIAS, body: body, headers: headerObj });
                    log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {
                    log.error('Error-afterSubmit', eventType + ' - ' + error);
                }
            } else if (objRecord.type == INVENTORY_STATUS_CHANGE) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let jsonRequest = new Array();
                let stock = 0;
                let locationEcommerce = 14;
                let flagSend = 0;
                try {
                    let loadRecord = record.load({ type: record.Type.INVENTORY_STATUS_CHANGE, id: recordId, isDynamic: true });
                    let numLines = loadRecord.getLineCount({ sublistId: 'inventory' });
                    let location = loadRecord.getValue({ fieldId: 'location' });
                    if (numLines != 0 && location == locationEcommerce) {
                        log.debug('Inicio', 'INICIO-----------------------------------------');
                        flagSend = 1;
                        for (let i = 0; i < numLines; i++) {
                            let itemid = loadRecord.getSublistValue({ sublistId: 'inventory', fieldId: 'item', line: i });
                            let recordLoad = record.load({ type: record.Type.INVENTORY_ITEM, id: itemid, isDynamic: true });
                            let sku = recordLoad.getValue({ fieldId: 'itemid' });
                            let saleconversionrate = parseInt(recordLoad.getValue({ fieldId: 'saleconversionrate' }));
                            let stockconversionrate = parseInt(recordLoad.getValue({ fieldId: 'stockconversionrate' }));
                            let quantityavailable = parseInt(recordLoad.getSublistValue({ sublistId: 'locations', fieldId: 'quantityavailable', line: 13 }));
                            stock = quantityavailable / (saleconversionrate / stockconversionrate);
                            jsonRequest.push({
                                "sku": sku,
                                "stock_quantity": stock
                            });
                        }

                    }
                    //SECTION SEND===================================================================================================
                    if (flagSend == 1) {
                        let body = JSON.stringify(jsonRequest);
                        log.debug('Request', body);
                        headerObj['Accept'] = ACCEPT;
                        headerObj['Authorization'] = TOKEN;
                        headerObj['Content-Type'] = CONTENT_TYPE;
                        let response = https.post({ url: URL_STOCK, body: body, headers: headerObj });
                        log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                        log.debug('FIN', 'FIN--------------------------------------------');
                    }
                } catch (error) {
                    log.error('Error-beforeLoad', eventType + ' - ' + error);
                }
            } else if (objRecord.type == ITEM) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let jsonRequest = new Array();
                let arrayNodes = [];
                let jsonAttributes = {};
                let id = 0;
                let parent = 0;
                let level = 0;
                let description = 0;
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let objRecord = record.load({ type: record.Type.INVENTORY_ITEM, id: recordId, isDynamic: true });
                    let sku = objRecord.getValue({ fieldId: 'upccode' });
                    let displayname = objRecord.getValue({ fieldId: 'displayname' });
                    let salesdescription = objRecord.getValue({ fieldId: 'salesdescription' });
                    let regular_price = objRecord.getSublistValue({ sublistId: 'price1', fieldId: 'price_1_', line: 0 });
                    let hierarchy = objRecord.getSublistValue({ sublistId: 'hierarchyversions', fieldId: 'hierarchynode', line: 1 });
                    log.debug('Debug1', hierarchy);
                    if (hierarchy.length != 0) {
                        let hierarchyNode = getHierarchyNode(hierarchy);
                        log.debug('Debug2', hierarchyNode);
                        parent = hierarchyNode.parent;
                        id = hierarchyNode.id;
                        level = hierarchyNode.level;
                        description = hierarchyNode.description;
                        if (level == 4) {
                            let hierarchyNodeLevel3 = getHierarchyNode(parent);
                            let hierarchyNodeLevel2 = getHierarchyNode(hierarchyNodeLevel3.parent);
                            log.debug('Debug3', hierarchyNodeLevel3);
                            arrayNodes = [parseInt(hierarchyNodeLevel2.description), parseInt(hierarchyNodeLevel3.description), parseInt(description)]
                        } else if (hierarchyNode.level == 3) {
                            let hierarchyNodeLevel3 = getHierarchyNode(parent);
                            arrayNodes = [parseInt(hierarchyNodeLevel3.description), parseInt(description)];
                        } else if (hierarchyNode.level == 2) {
                            arrayNodes = [parseInt(description)]
                        }
                    }
                    log.debug('Debug4', arrayNodes);

                    //Attributes=============================================================================
                    let anioedicion = objRecord.getValue({ fieldId: 'custitemanioedicion' });
                    if (anioedicion.length != 0) {
                        jsonAttributes.Año = [anioedicion]
                    }
                    let idioma = objRecord.getText({ fieldId: 'custitem_ib_idioma' });
                    if (idioma.length != 0) {
                        jsonAttributes.Idioma = [idioma]
                    }
                    let editorial = objRecord.getValue({ fieldId: 'custitem_ib_editorial' });
                    if (editorial.length != 0) {
                        jsonAttributes.Editorial = [editorial]
                    }
                    // let empaste = objRecord.getText({ fieldId: 'custitem_ib_empaste' });
                    // if (empaste.length != 0) {
                    //     jsonAttributes.empaste = [empaste]
                    // }
                    let peso = objRecord.getValue({ fieldId: 'custitemib_peso' });
                    if (peso.length != 0) {
                        jsonAttributes.Peso = [peso.toString()]
                    }
                    let numero_paginas = objRecord.getValue({ fieldId: 'custitem_ib_numero_paginas' });
                    if (numero_paginas.length != 0) {
                        jsonAttributes.Páginas = [String(numero_paginas)]
                    }
                    let dimension_largo = objRecord.getValue({ fieldId: 'custitemib_dimension_largo' });
                    if (dimension_largo.length != 0) {
                        jsonAttributes.Alto = [dimension_largo + 'cm'];
                    }
                    let dimension_ancho = objRecord.getValue({ fieldId: 'custitemib_dimension_ancho' });
                    if (dimension_ancho.length != 0) {
                        jsonAttributes.Ancho = [dimension_ancho + 'cm'];
                    }
                    // let dimension = objRecord.getValue({ fieldId: 'custitem_ib_dimension' });
                    // if (dimension.length != 0) {
                    //     jsonAttributes.dimension = [dimension]
                    // }
                    // let pvp_soles = objRecord.getValue({ fieldId: 'custitemib_pvp_soles' });
                    // if (pvp_soles.length != 0) {
                    //     jsonAttributes.pvp_soles = [pvp_soles]
                    // }
                    let autor = objRecord.getValue({ fieldId: 'custitem_ib_autor' });
                    if (autor.length != 0) {
                        jsonAttributes.Autor = [autor]
                    }
                    // let categoria = objRecord.getText({ fieldId: 'custitemib_categoria' });
                    // if (categoria.length != 0) {
                    //     jsonAttributes.categoria = [categoria]
                    // }
                    // let resenia_libro = objRecord.getValue({ fieldId: 'custitemib_resenia_libro' });
                    // if (resenia_libro.length != 0) {
                    //     jsonAttributes.resenia_libro = [resenia_libro]
                    // }
                    // let subcategoria = objRecord.getText({ fieldId: 'custitemib_subcategoria' });
                    // if (subcategoria.length != 0) {
                    //     jsonAttributes.subcategoria = [subcategoria]
                    // }
                    // let edad = objRecord.getText({ fieldId: 'custitemib_edad' });
                    // if (edad.length != 0) {
                    //     jsonAttributes.edad = [edad]
                    // }
                    // let clases = objRecord.getValue({ fieldId: 'custitemib_clases' });
                    // if (clases.length != 0) {
                    //     jsonAttributes.clases = [clases]
                    // }
                    // let coleccion = objRecord.getValue({ fieldId: 'custitemib_coleccion' });
                    // if (coleccion.length != 0) {
                    //     jsonAttributes.coleccion = [coleccion]
                    // }
                    // let fecha_ingreso = objRecord.getText({ fieldId: 'custitemib_fecha_ingreso' });
                    // if (fecha_ingreso.length != 0) {
                    //     jsonAttributes.fecha_ingreso = [fecha_ingreso]
                    // }
                    // let pais_origen = objRecord.getText({ fieldId: 'custitemib_pais_origen' });
                    // if (pais_origen.length != 0) {
                    //     jsonAttributes.pais_origen = [pais_origen]
                    // }
                    // let origen = objRecord.getText({ fieldId: 'custitemib_origen' });
                    // if (origen.length != 0) {
                    //     jsonAttributes.origen = [origen]
                    // }
                    // let url = objRecord.getValue({ fieldId: 'custitemib_url' });
                    // if (url.length != 0) {
                    //     jsonAttributes.url = [url]
                    // }
                    //SECTION SEND===========================================================================
                    jsonRequest = {
                        "sku": sku,
                        "name": displayname,
                        "short_description": salesdescription,
                        "description": salesdescription,
                        "regular_price": parseFloat(regular_price),
                    }
                    hierarchy.length != 0 ? jsonRequest.categories = arrayNodes : log.debug('Hierarchy', 'nothing');
                    jsonRequest.attributes = jsonAttributes;
                    let body = JSON.stringify([jsonRequest]);
                    log.debug('Request', body);
                    headerObj['Accept'] = ACCEPT;
                    headerObj['Authorization'] = TOKEN;
                    headerObj['Content-Type'] = CONTENT_TYPE;
                    let response = https.post({ url: URL_ITEMS, body: body, headers: headerObj });
                    log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {
                    log.error('Error-afterSubmit', eventType + ' - ' + error);
                }
            }
        } else if (eventType === context.UserEventType.COPY) {
            const objRecord = context.newRecord;
            if (objRecord.type == ITEM) {
                let recordId = objRecord.id;
                let headerObj = new Array();
                let jsonRequest = new Array();
                let jsonAttributes = {};
                let arrayNodes = [];
                let id = 0;
                let parent = 0;
                try {
                    log.debug('Inicio', 'INICIO-----------------------------------------');
                    let objRecord = record.load({ type: record.Type.INVENTORY_ITEM, id: recordId, isDynamic: true });
                    let sku = objRecord.getValue({ fieldId: 'upccode' });
                    let displayname = objRecord.getValue({ fieldId: 'displayname' });
                    let salesdescription = objRecord.getValue({ fieldId: 'salesdescription' });
                    let regular_price = objRecord.getSublistValue({ sublistId: 'price1', fieldId: 'price_1_', line: 0 });
                    let hierarchy = objRecord.getSublistValue({ sublistId: 'hierarchyversions', fieldId: 'hierarchynode', line: 1 });
                    log.debug('Debug1', hierarchy);
                    if (hierarchy.length != 0) {
                        let hierarchyNode = getHierarchyNode(hierarchy);
                        log.debug('Debug2', hierarchyNode);
                        parent = hierarchyNode.parent;
                        id = hierarchyNode.id;
                        level = hierarchyNode.level;
                        description = hierarchyNode.description;
                        if (level == 4) {
                            let hierarchyNodeLevel3 = getHierarchyNode(parent);
                            let hierarchyNodeLevel2 = getHierarchyNode(hierarchyNodeLevel3.parent);
                            log.debug('Debug3', hierarchyNodeLevel3);
                            arrayNodes = [parseInt(hierarchyNodeLevel2.description), parseInt(hierarchyNodeLevel3.description), parseInt(description)]
                        } else if (hierarchyNode.level == 3) {
                            let hierarchyNodeLevel3 = getHierarchyNode(parent);
                            arrayNodes = [parseInt(hierarchyNodeLevel3.description), parseInt(description)];
                        } else if (hierarchyNode.level == 2) {
                            arrayNodes = [parseInt(description)]
                        }
                    }
                    log.debug('Debug4', arrayNodes);

                    //Attributes=============================================================================
                    let anioedicion = objRecord.getValue({ fieldId: 'custitemanioedicion' });
                    if (anioedicion.length != 0) {
                        jsonAttributes.Año = [anioedicion]
                    }
                    let idioma = objRecord.getText({ fieldId: 'custitem_ib_idioma' });
                    if (idioma.length != 0) {
                        jsonAttributes.Idioma = [idioma]
                    }
                    let editorial = objRecord.getValue({ fieldId: 'custitem_ib_editorial' });
                    if (editorial.length != 0) {
                        jsonAttributes.Editorial = [editorial]
                    }
                    // let empaste = objRecord.getText({ fieldId: 'custitem_ib_empaste' });
                    // if (empaste.length != 0) {
                    //     jsonAttributes.empaste = [empaste]
                    // }
                    let peso = objRecord.getValue({ fieldId: 'custitemib_peso' });
                    if (peso.length != 0) {
                        jsonAttributes.Peso = [peso.toString()]
                    }
                    let numero_paginas = objRecord.getValue({ fieldId: 'custitem_ib_numero_paginas' });
                    if (numero_paginas.length != 0) {
                        jsonAttributes.Páginas = [String(numero_paginas)]
                    }
                    let dimension_largo = objRecord.getValue({ fieldId: 'custitemib_dimension_largo' });
                    if (dimension_largo.length != 0) {
                        jsonAttributes.Alto = [dimension_largo + 'cm'];
                    }
                    let dimension_ancho = objRecord.getValue({ fieldId: 'custitemib_dimension_ancho' });
                    if (dimension_ancho.length != 0) {
                        jsonAttributes.Ancho = [dimension_ancho + 'cm'];
                    }
                    // let dimension = objRecord.getValue({ fieldId: 'custitem_ib_dimension' });
                    // if (dimension.length != 0) {
                    //     jsonAttributes.dimension = [dimension]
                    // }
                    // let pvp_soles = objRecord.getValue({ fieldId: 'custitemib_pvp_soles' });
                    // if (pvp_soles.length != 0) {
                    //     jsonAttributes.pvp_soles = [pvp_soles]
                    // }
                    let autor = objRecord.getValue({ fieldId: 'custitem_ib_autor' });
                    if (autor.length != 0) {
                        jsonAttributes.Autor = [autor]
                    }
                    // let categoria = objRecord.getText({ fieldId: 'custitemib_categoria' });
                    // if (categoria.length != 0) {
                    //     jsonAttributes.categoria = [categoria]
                    // }
                    // let resenia_libro = objRecord.getValue({ fieldId: 'custitemib_resenia_libro' });
                    // if (resenia_libro.length != 0) {
                    //     jsonAttributes.resenia_libro = [resenia_libro]
                    // }
                    // let subcategoria = objRecord.getText({ fieldId: 'custitemib_subcategoria' });
                    // if (subcategoria.length != 0) {
                    //     jsonAttributes.subcategoria = [subcategoria]
                    // }
                    // let edad = objRecord.getText({ fieldId: 'custitemib_edad' });
                    // if (edad.length != 0) {
                    //     jsonAttributes.edad = [edad]
                    // }
                    // let clases = objRecord.getValue({ fieldId: 'custitemib_clases' });
                    // if (clases.length != 0) {
                    //     jsonAttributes.clases = [clases]
                    // }
                    // let coleccion = objRecord.getValue({ fieldId: 'custitemib_coleccion' });
                    // if (coleccion.length != 0) {
                    //     jsonAttributes.coleccion = [coleccion]
                    // }
                    // let fecha_ingreso = objRecord.getText({ fieldId: 'custitemib_fecha_ingreso' });
                    // if (fecha_ingreso.length != 0) {
                    //     jsonAttributes.fecha_ingreso = [fecha_ingreso]
                    // }
                    // let pais_origen = objRecord.getText({ fieldId: 'custitemib_pais_origen' });
                    // if (pais_origen.length != 0) {
                    //     jsonAttributes.pais_origen = [pais_origen]
                    // }
                    // let origen = objRecord.getText({ fieldId: 'custitemib_origen' });
                    // if (origen.length != 0) {
                    //     jsonAttributes.origen = [origen]
                    // }
                    // let url = objRecord.getValue({ fieldId: 'custitemib_url' });
                    // if (url.length != 0) {
                    //     jsonAttributes.url = [url]
                    // }
                    //SECTION SEND===========================================================================
                    jsonRequest = {
                        "sku": sku,
                        "name": displayname,
                        "short_description": salesdescription,
                        "description": salesdescription,
                        "regular_price": parseFloat(regular_price),
                        "stock_quantity": 0,
                    }
                    hierarchy.length != 0 ? jsonRequest.categories = arrayNodes : log.debug('Hierarchy', 'nothing');
                    jsonRequest.attributes = jsonAttributes;
                    let body = JSON.stringify([jsonRequest]);
                    log.debug('Request', body);
                    headerObj['Accept'] = ACCEPT;
                    headerObj['Authorization'] = TOKEN;
                    headerObj['Content-Type'] = CONTENT_TYPE;
                    let response = https.post({ url: URL_ITEMS, body: body, headers: headerObj });
                    log.debug('Response', 'status: ' + response.code + ' - ' + 'response: ' + response.body);
                    log.debug('FIN', 'FIN--------------------------------------------');
                } catch (error) {
                    log.error('Error-beforeLoad', eventType + ' - ' + error);
                }
            }
        }
    }


    const getHierarchyNode = (internalid) => {
        let searchLoad = search.load({ id: 'customsearch_pe_merchandi_hierarchy_node' }); //! PE - Merchandise Hierarchy Node - PRODUCCION
        let filters = searchLoad.filters;
        const filterOne = search.createFilter({ name: 'internalid', operator: search.Operator.ANYOF, values: internalid });
        filters.push(filterOne);
        const searchResultCount = searchLoad.runPaged().count;
        if (searchResultCount != 0) {
            const searchResult = searchLoad.run().getRange({ start: 0, end: 1 });
            let id = searchResult[0].getValue(searchLoad.columns[0]);
            let level = searchResult[0].getValue(searchLoad.columns[1]);
            let parent = searchResult[0].getValue(searchLoad.columns[2]);
            let description = searchResult[0].getValue(searchLoad.columns[3]);

            return {
                id: id,
                level: level,
                parent: parent,
                description: description
            }
        }
    }

    return {
        beforeLoad: beforeLoad,
        afterSubmit: afterSubmit,
        beforeSubmit: beforeSubmit
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