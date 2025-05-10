import type { XhrEvent, XhrData } from '@lib/types';


interface CustomXMLHttpRequest extends XMLHttpRequest {
    _method?: string;
    _url?: string;
    _requestHeaders?: Record<string, string>;
    _startTime?: string;
}

function sendToContent(obj: XhrData): void {
    window.dispatchEvent(new CustomEvent<XhrEvent>("getXhrData", {
        detail: {
            data: obj
        }
    }));
}

(function (XMLHttpRequest: typeof window.XMLHttpRequest): void {
    const XHR = XMLHttpRequest.prototype;

    const open = XHR.open;
    const send = XHR.send;
    const setRequestHeader = XHR.setRequestHeader;

    XHR.open = function (
        this: CustomXMLHttpRequest,
        method: string,
        url: string | URL,
        async?: boolean,
        username?: string | null,
        password?: string | null
    ) {
        this._method = method;
        this._url = url.toString();
        this._requestHeaders = {};
        this._startTime = (new Date()).toISOString();

        return open.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };

    XHR.setRequestHeader = function (this: CustomXMLHttpRequest, header: string, value: string) {
        if (this._requestHeaders) {
            this._requestHeaders[header] = value;
        }
        return setRequestHeader.call(this, header, value);
    };

    XHR.send = function (this: CustomXMLHttpRequest, postData: Document | XMLHttpRequestBodyInit | null) {
        this.addEventListener('load', function (this: CustomXMLHttpRequest) {
            const endTime = (new Date()).toISOString();
            const myUrl = this._url ? this._url.toLowerCase() : this._url;

            if (myUrl) {
                if (postData) {
                    if (typeof postData === 'string') {
                        try {
                            this._requestHeaders = JSON.parse(postData);
                        } catch (err) {
                            console.log('Request Header JSON decode failed, transfer_encoding field could be base64');
                            console.log(err);
                        }
                    }
                }

                const responseHeaders = this.getAllResponseHeaders();
                const responseCookies = this.getResponseHeader('Set-Cookie');
                const requestCookies = this._requestHeaders?.['Cookie'];

                if (this.responseType !== 'blob' && this.responseText) {
                    try {
                        const arr = JSON.parse(this.responseText);
                        sendToContent({
                            ...arr,
                            url: this._url,
                            requestCookies: requestCookies ? JSON.parse(requestCookies) : undefined,
                            responseCookies: responseCookies ? JSON.parse(responseCookies) : undefined
                        });
                    } catch (err) {
                        // Silently handle parse errors
                    }
                }
            }
        });

        return send.call(this, postData);
    };
})(XMLHttpRequest);

export const placeholder = 1;