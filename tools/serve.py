from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import functools

class NoCache(SimpleHTTPRequestHandler):
    """开发服务器：禁用一切缓存。
    Cocos 的产物路径固定（assets/main/index.js），浏览器缓存住旧包之后，
    页面跑的是旧代码而服务端是新的——排查时极易误判成「构建没生效」。"""
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

H = functools.partial(NoCache, directory='game/build/web-mobile')
# 开发预览只允许本机访问，避免把未发布的游戏代码和资源暴露到局域网。
ThreadingHTTPServer(('127.0.0.1', 5185), H).serve_forever()
