/* eslint-disable no-case-declarations */
const net = require("net")
const http = require("http")
const Buffer = require("buffer").Buffer
const emitter = require("events").EventEmitter

function concatenate(resultConstructor, ...arrays) {
	let totalLength = 0
	for (const arr of arrays) {
		totalLength += arr.length
	}
	const result = new resultConstructor(totalLength)
	let offset = 0
	for (const arr of arrays) {
		result.set(arr, offset)
		offset += arr.length
	}
	return result
}


/**
 *Sends and receives data from BYOND
 *
 * @export
 * @class byondLink
 * @extends {emitter}
 */
class byondLink extends emitter{
	/**
	 *Creates an instance of byondLink.Requires a host/ip,port.Set server_port to create a server to receive world.Export() calls. 
	 Add a callback in server_cb to be able to access the reply and response objects directly.
	 * @param {*} host
	 * @param {number} port
	 * @param {number} [server_port = 0]
	 * @param {function({http.IncomingMessage},{http.ServerResponse}):void} [server_cb=null]
	 * @memberof byondLink
	 */
	constructor(host,port,server_port = 0,server_cb = null,suffix = ""){
		super()
		this.host = host
		this.port = port
		this.lastError = null
		this.suffix = suffix

		if(server_port) {
			this.register_server(server_port,server_cb)
		}
	}
	/**
	 *Sends data to world/Topic()
	 *
	 * @param {string} data
	 * @param {function(void|number|string):void} cb
	 * @memberof byondLink
	 */
	send(data,cb = null,ignoreSuffix = false){
		let databuf = new Uint8Array()
		let len = null
		/**
		 * @type {net.Socket}
		 */
		if(data[0] !== "?"){
			data = "?" + data
		}
		if(this.suffix && !ignoreSuffix){
			data = data + this.suffix
		}

		let socket = net.createConnection(this.port,this.host)
		socket.addListener("error",(e) => {
			this.lastError = e.message
			this.emit("error",e)
			socket.end()
			return false
		})
		socket.addListener("timeout",() => {
			this.lastError = "Timeout"
			this.emit("error",new Error("Timeout"))
			socket.end()
			return false
		})
		socket.addListener("connect",(...e) => {
			this.emit("connect",...e)
			socket.write(this.topic_packet(data))
		})
		socket.addListener("data",(e) => {
			if(typeof(cb) != "function"){
				socket.end()
				return
			}
			databuf = concatenate(Buffer,databuf, e)

			if(databuf.length >= 4){ //read length when you get it
				let view = new DataView(e.buffer)
				if(view.getUint16(0) !== 0x0083){
					databuf = new Uint8Array()
					return //not what we are looking for
				}
				len = view.getUint16(2)
			}

			let bodybuf = databuf.buffer.slice(4)
			if(bodybuf.length < len){
				return //do not do anything if its not the whole packet
			}
			let data = this.process_data(bodybuf,len)
			socket.end()
			cb(data)
		})
		socket.addListener("end",(...e) => {
			this.emit("end",...e)
		})
	}
	/**
	 *
	 *
	 * @param {string} data
	 * @returns {ArrayBuffer}
	 * @memberof byondLink
	 */
	topic_packet(data){
		let datalen = data.length + 6
		let buflen = 2 + 2 + 5 + data.length + 1
		let bytes = Buffer.alloc(buflen)

		bytes[0] = 0x00
		bytes[1] = 0x83
		bytes[2] = datalen >> 8
		bytes[3] = datalen
		/* padding between header and data (5 bytes of 0x00)*/
		for (let y = 0; y < data.length; y++) {
			bytes[9+y] = data.charCodeAt(y) //offsets it to 9 so the padding is there
		}
		bytes[buflen] = 0x00 //last char after the string must be 0x00
		return bytes
	}
	/**
	 * Decodes data from the reply to a Topic call
	 *
	 * @param {ArrayBuffer} buffer
	 * @returns {void\|number\|string}
	 * @memberof byondLink
	 */
	process_data(buffer,length){
		let view = new DataView(buffer)
		let type = view.getUint8(0)
		
		switch (type) {
		case 0:
			return null
		case 0x06:
			let retval = ""
			for (let i = 0; i < (length - 1); i++) { //its (len - 2) to remove the nullbyte and the type byte
				const element = view.getUint8([1 + i])
				retval = retval + String.fromCharCode(element)
			}
			return retval
		case 0x2a:
			return view.getFloat32(1,true)
		}
	}

	/**
	 * Enables the http server,requires a port argument
	 *
	 * @param {number} server_port
	 * @param {function({http.IncomingMessage},{http.ServerResponse}):void} server_cb
	 * @memberof byondLink
	 * @fires byondLink#topic
	 */
	register_server(server_port,server_cb){
		this.server = http.createServer((req,res) => {
			if(typeof(server_cb) == "function"){
				server_cb(req,res)
			}else{
				this.emit("topic",req.url)
				res.end("Success","ascii")
			}
		})
		this.server.listen(server_port).on("error",(error) => this.emit("error",error))
	}
	/**
	 *Stops the server
	 *
	 * @memberof byondLink
	 */
	stop_server(){
		this.server.close()
	}
}

module.exports = byondLink
/**
* Topic event
* @event byondLink#topic
* @type {object}
* @property {string} topic Data provided by export call
*/
