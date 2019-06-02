'use strict'

/*
 * This module provides a simplified interface into the Aurora Serverless
 * Data API by abstracting away the notion of field values.
 *
 * More detail regarding the Aurora Serverless Data APIcan be found here:
 * https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
 *
 * @author Jeremy Daly <jeremy@jeremydaly.com>
 * @version 1.0.0
 * @license MIT
 */

// Require the aws-sdk. This is a dev dependency, so if being used
// outside of a Lambda execution environment, it must be manually installed.
const AWS = require('aws-sdk')

//-------------------------------------------------------------------------//
// Enable HTTP Keep-Alive per https://vimeo.com/287511222
// This dramatically increases the speed of subsequent HTTP calls
//-------------------------------------------------------------------------//

  const https = require('https')

  const sslAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50, // same as aws-sdk
    rejectUnauthorized: true  // same as aws-sdk
  })
  sslAgent.setMaxListeners(0) // same as aws-sdk

  // Update the default AWS http agent with our new sslAgent
  AWS.config.update({ httpOptions: { agent: sslAgent } })


//-------------------------------------------------------------------------//
// PRIVATE METHODS
//-------------------------------------------------------------------------//

  // Simple error function
  const error = (...err) => { throw Error(...err) }

  // Query function
  const query = async (config,...args) => {

    // Parse hydration and parameters
    const sql = parseSQL(args)
    const hydrateColumnNames = parseHydrate(config,args)
    const parameters = annotateParams(parseParams(args)) // need to add ordering here

    // Determine if this is a batch request
    const isBatch = parameters.length > 0
      && Array.isArray(parameters[0]) ? true : false

    const params = Object.assign(
      prepareParams(config,args),
      {
        database: parseDatabase(config,args), // add database
        sql // add sql statement
      },
      // Add parameters if supplied
      parameters.length > 0 ?
        { [isBatch ? 'parameterSets' : 'parameters']: parameters } : {},
      // Force meta data if set and not a batch
      hydrateColumnNames && !isBatch ? { includeResultMetadata: true } : {}
    )

    // Format and return the results
    return formatResults(
      await (isBatch ? config.RDS.batchExecuteStatement(params).promise()
        : config.RDS.executeStatement(params).promise()),
      hydrateColumnNames,
      args[0].includeResultMetadata === true ? true : false
    )

  } // end query

  // Parse SQL statement from provided arguments
  const parseSQL = args =>
    typeof args[0] === 'string' ? args[0]
    : typeof args[0] === 'object' && typeof args[0].sql === 'string' ? args[0].sql
    : error(`No 'sql' statement provided.`)

  // Parse the parameters from provided arguments
  const parseParams = args =>
    Array.isArray(args[0].parameters) ? args[0].parameters
    : typeof args[0].parameters === 'object' ? [args[0].parameters]
    : Array.isArray(args[1]) ? args[1]
    : typeof args[1] === 'object' ? [args[1]]
    : args[0].parameters ? error(`'parameters' must be an object or array`)
    : args[1] ?  error(`Parameters must be an object or array`)
    : []

  // Parse the supplied database, or default to config
  const parseDatabase = (config,args) =>
    typeof args[0].database === 'string' ? args[0].database
    : args[0].database ? error(`'database' must be a string.`)
    : config.database ? config.database
    : error(`No 'database' provided.`)

  // Parse the supplied hydrateColumnNames command, or default to config
  const parseHydrate = (config,args) =>
    typeof args[0].hydrateColumnNames === 'boolean' ? args[0].hydrateColumnNames
    : args[0].hydrateColumnNames ? error(`'hydrateColumnNames' must be a boolean.`)
    : config.hydrateColumnNames

  // Prepare method params w/ supplied inputs if an object is passed
  const prepareParams = ({ secretArn,resourceArn },args) => {
    return Object.assign(
      { secretArn,resourceArn }, // return Arns
      typeof args[0] === 'object' ?
        omit(args[0],['hydrateColumnNames']) : {} // merge any inputs
    )
  }

  // Utility function for removing certain keys from an object
  const omit = (obj,values) => Object.keys(obj).reduce((acc,x) =>
    values.includes(x) ? acc : Object.assign(acc,{ [x]: obj[x] })
  ,{})

  // Annotate parameters with correct types
  const annotateParams = params => params.reduce((acc,p) =>
    Array.isArray(p) ? acc.concat([annotateParams(p)])
      : Object.keys(p).length === 2 && p.name && p.value ? acc.concat(p)
      : acc.concat(formatParams(p))
  ,[]) // end reduce


  const formatParams = p => Object.keys(p).reduce((arr,x) =>
    arr.concat(formatType(x,p[x],getType(p[x]))),[])


  const getType = val =>
    typeof val === 'string' ? 'stringValue'
    : typeof val === 'boolean' ? 'booleanValue'
    : typeof val === 'number' && parseInt(val) === val ? 'longValue'
    : typeof val === 'number' && parseFloat(val) === val ? 'doubleValue'
    : val === null ? 'isNull'
    : Buffer.isBuffer(val) ? 'blobValue'
    // : Array.isArray(val) ? 'arrayValue' This doesn't work yet
    : undefined

  const formatType = (name,value,type) => {
    return {
      name,
      value: {
        [type ? type : error(`'${name}'' is an invalid type`)] : value
      }
    }
  }

  const formatResults = ({ columnMetadata,numberOfRecordsUpdated,records }, hydrate, includeMeta) =>
    Object.assign( includeMeta ? { columnMetadata } : {},
      { numberOfRecordsUpdated, records: formatRecords(records, hydrate ? columnMetadata : false) } )

  const formatRecords = (recs,columns) => {

    // Create map for efficient value parsing
    let fmap = recs[0].map((x,i) => {
      return Object.assign({},
        columns ? { label: columns[i].label } : {} )
    })

    // Process the records
    return recs.map(rec => {
      return rec.reduce((acc,field,i) => {

        // If the field is null, always return null
        if (field.isNull === true) {
          return columns ?
            Object.assign(acc,{ [fmap[i].label]: null })
            : acc.concat(null)
        // If the field is mapped, return the mapped field
        } else if (fmap[i] && fmap[i].field) {
          return columns ?
            Object.assign(acc,{ [fmap[i].label]: field[fmap[i].field] })
            : acc.concat(field[fmap[i].field])
        // Else discover the field type
        } else {
          // Look for non-null fields
          Object.keys(field).map(type => {
            if (type !== 'isNull' && field[type] !== null) {
              fmap[i]['field'] = type
            }
          })
          // Return the mapped field (this should NEVER be null)
          return columns ?
            Object.assign(acc,{ [fmap[i].label]: field[fmap[i].field] })
            : acc.concat(field[fmap[i].field])
        }

      }, columns ? {} : [])
    })
  }


//-------------------------------------------------------------------------//
// INSTANTIATION
//-------------------------------------------------------------------------//

// Export main function
module.exports = (params) => {

  // Set the options for the RDSDataService
  const options = typeof params.options === 'object' ? params.options
    : params.options !== undefined ? error(`'options' must be an object`)
    : {}

  // Set the configuration for this instance
  const config = {

    // Require secretArn
    secretArn: typeof params.secretArn === 'string' ? params.secretArn
      : error(`'secretArn' string value required`),

    // Require resourceArn
    resourceArn: typeof params.resourceArn === 'string' ? params.resourceArn
     : error(`'resourceArn' string value required`),

    // Load optional database
    database: typeof params.database === 'string' ? params.database
      : params.database !== undefined ? error(`'database' must be a string`)
      : null,

    // Set hydrateColumnNames (default to true)
    hydrateColumnNames:
      typeof params.hydrateColumnNames === 'boolean' ? false : true,

    // TODO: Put this in a separate module for testing?
    // Create an instance of RDSDataService
    RDS: new AWS.RDSDataService(options)

  } // end config

  // Return public methods
  return {
    // Query method, pass config
    query: (...x) => query(config,...x),

    // Export promisified versions of the RDSDataService methods
    batchExecuteStatement: (x) => config.RDS.batchExecuteStatement(x).promise(),
    beginTransaction: (x) => config.RDS.beginTransaction(x).promise(),
    commitTransaction: (x) => config.RDS.commitTransaction(x).promise(),
    executeStatement: (x) => config.RDS.executeStatement(x).promise(),
    rollbackTransaction: (x) => config.RDS.rollbackTransaction(x).promise()
  }

} // end exports