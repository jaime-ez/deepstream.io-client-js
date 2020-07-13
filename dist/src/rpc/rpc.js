"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPC = void 0;
var constants_1 = require("../constants");
/**
 * This class represents a single remote procedure
 * call made from the client to the server. It's main function
 * is to encapsulate the logic around timeouts and to convert the
 * incoming response data
 */
var RPC = /** @class */ (function () {
    function RPC(name, correlationId, data, response, options, services) {
        this.name = name;
        this.correlationId = correlationId;
        this.response = response;
        this.options = options;
        this.services = services;
        this.onTimeout = this.onTimeout.bind(this);
        var message = {
            topic: constants_1.TOPIC.RPC,
            action: constants_1.RPC_ACTION.REQUEST,
            correlationId: correlationId,
            name: name,
            parsedData: data
        };
        this.acceptTimeout = this.services.timeoutRegistry.add({
            message: {
                topic: constants_1.TOPIC.RPC,
                action: constants_1.RPC_ACTION.ACCEPT,
                name: this.name,
                correlationId: this.correlationId
            },
            event: constants_1.RPC_ACTION.ACCEPT_TIMEOUT,
            duration: this.options.rpcAcceptTimeout,
            callback: this.onTimeout
        });
        this.responseTimeout = this.services.timeoutRegistry.add({
            message: {
                topic: constants_1.TOPIC.RPC,
                action: constants_1.RPC_ACTION.REQUEST,
                name: this.name,
                correlationId: this.correlationId
            },
            event: constants_1.RPC_ACTION.RESPONSE_TIMEOUT,
            duration: this.options.rpcResponseTimeout,
            callback: this.onTimeout
        });
        this.services.connection.sendMessage(message);
    }
    /**
     * Called once an ack message is received from the server
     */
    RPC.prototype.accept = function () {
        this.services.timeoutRegistry.clear(this.acceptTimeout);
    };
    /**
     * Called once a response message is received from the server.
     */
    RPC.prototype.respond = function (data) {
        this.response(null, data);
        this.complete();
    };
    /**
     * Called once an error is received from the server.
     */
    RPC.prototype.error = function (data) {
        this.response(data);
        this.complete();
    };
    /**
     * Callback for error messages received from the server. Once
     * an error is received the request is considered completed. Even
     * if a response arrives later on it will be ignored / cause an
     * UNSOLICITED_MESSAGE error
     */
    RPC.prototype.onTimeout = function (event, message) {
        this.response(constants_1.RPC_ACTION[event]);
        this.complete();
    };
    /**
     * Called after either an error or a response
     * was received
    */
    RPC.prototype.complete = function () {
        this.services.timeoutRegistry.clear(this.acceptTimeout);
        this.services.timeoutRegistry.clear(this.responseTimeout);
    };
    return RPC;
}());
exports.RPC = RPC;
