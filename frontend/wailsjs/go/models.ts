export namespace http {
	
	export class Client {
	    Transport: any;
	    Jar: any;
	    Timeout: number;
	
	    static createFrom(source: any = {}) {
	        return new Client(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Transport = source["Transport"];
	        this.Jar = source["Jar"];
	        this.Timeout = source["Timeout"];
	    }
	}

}

export namespace main {
	
	export class ChunkInfo {
	    id: number;
	    start_byte: number;
	    end_byte: number;
	    written: number;
	    index: number;
	    state: number;
	
	    static createFrom(source: any = {}) {
	        return new ChunkInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.start_byte = source["start_byte"];
	        this.end_byte = source["end_byte"];
	        this.written = source["written"];
	        this.index = source["index"];
	        this.state = source["state"];
	    }
	}
	export class Download {
	    id: number;
	    url: string;
	    path: string;
	    size: number;
	    chunks: number;
	    chunk_info: ChunkInfo[];
	    state: number;
	    completed_chunks: number;
	    workers: number;
	
	    static createFrom(source: any = {}) {
	        return new Download(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.chunks = source["chunks"];
	        this.chunk_info = this.convertValues(source["chunk_info"], ChunkInfo);
	        this.state = source["state"];
	        this.completed_chunks = source["completed_chunks"];
	        this.workers = source["workers"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

