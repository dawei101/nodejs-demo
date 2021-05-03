const http = require('http');
const fs = require('fs')
const querystring = require('querystring')

http.createServer(route({
    '/login': login,
    '/signup': signup,
    '/': loginRequired(home),
})).listen(8080);


// -- component, global args and utils

class Storage {
    constructor(path) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
        this.path = path;
    }

    get(key) {
        const file = this.path + key + ".json";
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file));
        }
        return {}
    }

    set(key, data) {
        const file = this.path + key + ".json";
        fs.writeFileSync(file, JSON.stringify(data))
    }
}


function parseCookies(req) {
    let cks = {}
    if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        let cookie = '';
        for (let idx = 0; idx < cookies.length; idx++) {
            cookie = cookies[idx]
            const parts = cookie.match(/(.*?)=(.*)$/);
            cks[parts[1].trim()] = parts[2] || '';
        }
    }
    return cks;
}

const SESSIONID_KEY = 'sid'
const users = new Storage("/tmp/users/")
const sessions = new Storage("/tmp/sessions/")


// -- route

function route(routes) {
    return function(req, res) {
        if (req.url in routes) {
            routes[req.url](req, res)
        } else {
            render(req, res, 404, null)
        }
    }
}

// -- middleware

function loginRequired(func) {
    return function(req, res) {
        const cookies = parseCookies(req)
        if (SESSIONID_KEY in cookies) {
            const session = sessions.get(cookies[SESSIONID_KEY]);
            return func(req, res)
        }
        res.writeHead(302, {
            'Location': '/login'
        });
        res.end();
    }
}


// -- render | view

const tplPath = "./tpls/"

function getTplPath(req) {
    const filename = req.url.replace('/', '') || 'home';
    return tplPath + filename + ".html";
}


function render(req, res, status, data) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(status);
    res.end(renderTpl(getTplPath(req), data))
}


const tplPReg = /{{\s+([a-zA-Z][a-zA-Z\d]+)\s+}}/g

function renderTpl(tpl, data) {
    if (!fs.existsSync(tpl)) {
        return '';
    }
    const c = fs.readFileSync(tpl).toString();
    return c.replace(tplPReg, function(full, arg){
        if (data && arg in data) {
            return data[arg];
        }
        return '';
    })
}

// -- controller

function login(req, res) {
    if (req.method=="POST") {
        let body = ''
        req.on('data', function(chunk){
            body += chunk.toString();
        })
        req.on('end', function(){
            const form = querystring.parse(body)
            const un = form.username || '';
            const pwd = form.password || '';
            if (!un || !pwd) {
                return render(req, res, 422, {'username': un, 'msg': 'username and password are both required!'})
            }
            const user = users.get(un)
            if ('password' in user && user['password'] == pwd) {
                return releaseTokenThenRedirectToHome(res, un)
            }
            render(req, res, 401, {'username': un, 'msg': 'username or password is not correct!'})
        });
    } else {
        render(req, res, 200)
    }
}

function signup(req, res) {

    if (req.method=="POST") {
        let body = ''
        req.on('data', function(chunk){
            body += chunk.toString();
        })
        req.on('end', function(){
            const form = querystring.parse(body)
            const un = form.username || '';
            const pwd = form.password || '';

            if (!un || !pwd) {
                return render(req, res, 422, {'username': un, 'msg': 'username and password are both required!'})
            }
            const exists = users.get(un)
            if (Object.keys(exists).length>0) {
                render(req, res, 422, {'username': un, 'msg': 'username has been token!'})
                return
            }
            users.set(un, {'username': un, 'password': pwd})
            releaseTokenThenRedirectToHome(res, un)
        });
    } else {
        render(req, res, 200);
    }
}


function home(req, res) {
    const cookies = parseCookies(req)
    const session = sessions.get(cookies[SESSIONID_KEY]);
    render(req, res, 200, session)
}

function releaseTokenThenRedirectToHome(res, username) {
    // need to redirect with a real html page
    // or cookie could not be set in some web brower
    const sid = 's' + (Date.now());
    sessions.set(sid, {'username': username});
    res.setHeader('Set-Cookie', SESSIONID_KEY + '=' + sid)
    res.end('<html><head><meta http-equiv="refresh" content="2;url=/" /></head></html>')
}

