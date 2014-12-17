var C = require( '../constants/constants' ),
	RpcResponse = require( './rpc-response' ),
	Rpc = require( './rpc' ),
	messageBuilder = require( '../message/message-builder' );

/**
 * The main class for remote procedure calls
 * 
 * Provides the rpc interface and handles incoming messages
 * on the rpc topic
 * 
 * @param {Object} options deepstream configuration options
 * @param {Connection} connection
 * @param {Client} client
 * 
 * @constructor
 * @public
 */
var RpcHandler = function( options, connection, client ) {
	this._options = options;
	this._connection = connection;
	this._client = client;
	this._rpcs = {};
	this._providers = {};
};

/**
 * Registers a callback function as a RPC provider. If another connected client calls
 * client.rpc.make() the request will be routed to this method
 * 
 * The callback will be invoked with two arguments:
 * 		{Mixed} data The data passed to the client.rpc.make function
 *   	{RpcResponse} rpcResponse An object with methods to respons, acknowledge or reject the request
 *
 * Only one callback can be registered for a RPC at a time
 * 
 * Please note: Deepstream tries to deliver data in its original format. Data passed to client.rpc.make as a String will arrive as a String,
 * numbers or implicitly JSON serialized objects will arrive in their respective format as well
 * 
 * @public
 * @returns void
 */
RpcHandler.prototype.provide = function( name, callback ) {
	if( this._providers[ name ] ) {
		throw new Error( 'rpc ' + name + ' already registered' );
	}

	this._providers[ name ] = callback;
	this._connection.sendMsg( C.TOPIC.RPC, C.ACTIONS.SUBSCRIBE, [ name ] );
};

/**
 * Unregisters this client as a provider for a remote procedure call
 *
 * @param   {String} name the name of the rpc
 *
 * @public
 * @returns {void}
 */
RpcHandler.prototype.unprovide = function( name ) {
	if( this._providers[ name ] ) {
		this._connection.sendMsg( C.TOPIC.RPC, C.ACTIONS.UNSUBSCRIBE, [ name ] );
	}
};

/**
 * Executes the actual remote procedure call
 *
 * @param   {String}   name     The name of the rpc
 * @param   {Mixed}    data     Serializable data that will be passed to the provider
 * @param   {Function} callback Will be invoked with the returned result or if the rpc failed
 *                              receives to arguments: error or null and the result
 *
 * @public
 * @returns {void}
 */
RpcHandler.prototype.make = function( name, data, callback ) {
	var uid = this._client.getUid(),
		typedData = messageBuilder.typed( data );
		
	this._rpcs[ uid ] = new Rpc( this._options, callback );
	this._connection.sendMsg( C.TOPIC.RPC, C.ACTIONS.REQUEST, [ name, uid, typedData ] );
};

/**
 * Retrieves a RPC instance for a correlationId or throws an error
 * if it can't be found (which should never happen)
 * 
 * @param {String} correlationId
 * @param {String} rpcName
 * 
 * @private
 * @returns {Rpc}
 */
RpcHandler.prototype._getRpc = function( correlationId, rpcName ) {
	var rpc = this._rpcs[ correlationId ];

	if( !rpc ) {
		this._client._$onError( C.TOPIC.RPC, C.EVENT.UNSOLICITED_MESSAGE, rpcName );
		return null;
	}

	return rpc;
};

/**
 * Handles incoming rpc REQUEST messages. Instantiates a new response object
 * and invokes the provider callback or rejects the request if no rpc provider
 * is present (which shouldn't really happen, but might be the result of a race condition
 * if this client sends a unprovide message whilst an incoming request is already in flight)
 *
 * @param   {Object} message The parsed deepstream RPC request message.
 *
 * @private
 * @returns {void}
 */
RpcHandler.prototype._respondToRpc = function( message ) {
	var name = message.data[ 0 ],
		correlationId = message.data[ 1 ],
		data =  message.data[ 2 ] ? messageParser.convertTyped( message.data[ 2 ] ) : null,
		response;
		
	if( this._providers[ name ] ) {
		response = new RpcResponse( this._connection,name, correlationId );
		this._providers[ name ]( data, response );
	} else {
		this._connection.sendMsg( C.TOPIC.RPC, C.ACTIONS.REJECTION, [ name, correlationId ] );
	}
};

/**
 * Distributes incoming messages from the server
 * based on their action
 *
 * @param   {Object} message A parsed deepstream message
 *
 * @private
 * @returns {void}
 */
RpcHandler.prototype._$handle = function( message ) {
	// RPC Requests
	if( message.action === C.ACTIONS.REQUEST ) {
		this._respondToRpc( message );
		return;
	}
	
	// RPC Responses
	
	var rpcName = message.data[ 0 ],
		correlationId = message.data[ 1 ],
		rpc = this._getRpc( correlationId, rpcName );
		
	if( rpc === null ) {
		return;
	}
		
	if( message.action === C.ACTIONS.ACK ) {
		rpc.ack();
	}
	else if( message.action === C.ACTIONS.RESPONSE ) {
		rpc.respond( message.data[ 2 ] );
		delete this._rpcs[ correlationId ];
	}
	else if( message.action === C.ACTIONS.ERROR ) {
		message.processedError = true;
		rpc.error( message.data[ 2 ] );
		delete this._rpcs[ correlationId ];
	}
};

module.exports = RpcHandler;