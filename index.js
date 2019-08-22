const net = require("net")

/**
 *Sends and receives data from BYOND
 *
 * @export
 * @class byondLink
 */
class byondLink{
	/**
	 *Creates an instance of byondLink.Requires a host/ip,port.Set server_port to create a server to receive world.Export() calls
	 * @param {*} host
	 * @param {number} port
	 * @param {string} key
	 * @param {number} [server_port = 0]
	 * @memberof byondLink
	 */
	constructor(host,port,server_port = 0){
		this.host = host
		this.port = port
		this.server = null
		this.lastError = null

		if(server_port) {
			this.register_server(server_port)
		}
	}
	/**
	 *Sends data to world/Topic()
	 *
	 * @param {string} data
	 * @param {function(void|number|string):void} cb
	 * @memberof byondLink
	 */
	send(data,cb = null){
		/**
		 * @type {net.Socket}
		 */
		let socket = net.createConnection(this.port,this.host)
		socket.addListener("error",(e) => {
			this.lastError = e.message
			socket.end()
			return false
		})
		socket.addListener("timeout",(e) => {
			this.lastError = "Timeout"
			socket.end()
			return false
		})
		socket.addListener("connect",(e) => {
			socket.write(this.topic_packet(data))
		})
		socket.addListener("data",(e) => {
			if(typeof(cb) != "function"){
				socket.end()
				return
			}
			let data = this.process_data(e.buffer)
			if(data !== -1){
				cb(data)
				socket.end()
			}
		})
		socket.addListener("end",(e) => {
			console.log("end")
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
		let len = datalen.toString(16).padStart(4,"0")
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
	 * @param {Buffer} buffer
	 * @returns {void\|number\|string}
	 * @memberof byondLink
	 */
	process_data(buffer){
		let view = new DataView(buffer)
		if(view.getUint16(0) !== 0x0083){
			return -1 //not what we are looking for
		}
		let len = view.getUint16(2)
		let type = view.getUint8(4)
		
		switch (type) {
			case 0:
				return null
			case 0x06:
				let retval = ""
				for (let i = 0; i < (len-2); i++) { //its (len - 2) to remove the nullbyte and the type byte
					const element = view.getUint8([5 + i]);
					retval = retval + String.fromCharCode(element)
				}
				return retval
			case 0x2a:
				return view.getFloat32(5,true)
		}
	}

	buf2hex(buffer) { // buffer is an ArrayBuffer
		return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
	  }
	register_server(server_port){
		/**
		 * @type {net.Server}
		 */
		this.server = net.createServer((c) => {
			console.log("connect")
			c.on("data", (e) => {
				console.log(this.buf2hex(e.buffer))
				c.end()
			})
			c.on("timeout", (e) => {
				console.log("timeout server,ending")
				c.end()
			})
			c.on("end", () => console.log("connect end"))
		})
		this.server.listen(server_port,() => console.log("bound"))
		console.log("Registering server")
	}
}

module.exports = byondLink


//0015 001c 0002 0000db0100005d99551f817ebc3f55aef23261537d3f1366ff0f