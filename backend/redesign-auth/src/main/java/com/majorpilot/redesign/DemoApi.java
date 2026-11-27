package com.majorpilot.redesign;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/demo")
final class DemoApi {
    private static final String COOKIE = "__Host-mp_demo";
    private static final Set<String> OBJECT_FIELDS = Set.of("qs", "profile", "lenses", "brief", "ai", "ui");
    private final DemoAccounts accounts;
    private final ResendMail mail;
    private final ObjectMapper json;
    private final String origin;

    DemoApi(DemoAccounts accounts, ResendMail mail, ObjectMapper json, @Value("${demo.origin}") String origin) {
        this.accounts = accounts;
        this.mail = mail;
        this.json = json;
        this.origin = origin;
    }

    @GetMapping("/health")
    ResponseEntity<?> health() {
        return result(200, Map.of("ok", true));
    }

    @GetMapping("/session")
    ResponseEntity<?> session(@CookieValue(name = COOKIE, required = false) String session) throws IOException {
        var account = accounts.account(session);
        return result(200, account == null ? Map.of("signedIn", false) : state(account));
    }

    @PostMapping(path = "/link", consumes = "application/json")
    ResponseEntity<?> link(HttpServletRequest request) throws IOException {
        if (!sameOrigin(request)) return error(403, "ORIGIN");
        JsonNode input = body(request, 1024);
        String email = input == null ? null : DemoAccounts.email(input.path("email").textValue());
        if (email == null) return error(422, "EMAIL");
        if (!mail.recipientAllowed(email)) return error(403, "MAIL_UNAVAILABLE");
        String ip = request.getHeader("X-Real-IP");
        String link = accounts.issue(email, ip == null ? request.getRemoteAddr() : ip);
        if (link == null) return error(429, "TRY_LATER");
        if (!mail.send(email, link, "zh".equals(input.path("lang").textValue()))) {
            accounts.discardLink(link);
            return error(503, "MAIL_UNAVAILABLE");
        }
        return result(202, Map.of("accepted", true));
    }

    @PostMapping(path = "/sign-in", consumes = "application/json")
    ResponseEntity<?> signIn(HttpServletRequest request, @CookieValue(name = COOKIE, required = false) String session)
            throws IOException {
        if (!sameOrigin(request)) return error(403, "ORIGIN");
        JsonNode input = body(request, 1024);
        var login = input == null ? null : accounts.consume(input.path("token").textValue(), session);
        if (login == null) return error(422, "INVALID_LINK");
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, cookie(login.session(), DemoAccounts.SESSION_SECONDS))
                .body(state(login.account()));
    }

    @PutMapping(path = "/progress", consumes = "application/json")
    ResponseEntity<?> progress(HttpServletRequest request, @CookieValue(name = COOKIE, required = false) String session)
            throws IOException {
        if (!sameOrigin(request)) return error(403, "ORIGIN");
        if (accounts.account(session) == null) return error(401, "SIGNED_OUT");
        JsonNode input = body(request, 128 * 1024);
        if (input == null) return error(422, "PROGRESS");
        JsonNode revision = input.path("revision");
        String owner = input.path("accountId").textValue();
        JsonNode progress = input.path("progress");
        if (owner == null || !owner.matches("[a-f0-9-]{36}") || !revision.isIntegralNumber()
                || !revision.canConvertToLong() || revision.longValue() < 0 || !validProgress(progress)) {
            return error(422, "PROGRESS");
        }
        var save = accounts.save(session, owner, revision.longValue(), json.writeValueAsString(progress));
        if (save.saved()) return result(200, Map.of("revision", revision.longValue() + 1));
        if (save.account() == null || !save.account().id().equals(owner)) return error(401, "SIGNED_OUT");
        return result(409, state(save.account()));
    }

    @PostMapping("/sign-out")
    ResponseEntity<?> signOut(HttpServletRequest request, @CookieValue(name = COOKIE, required = false) String session) {
        if (!sameOrigin(request)) return error(403, "ORIGIN");
        accounts.logout(session);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, cookie("", 0)).build();
    }

    private String cookie(String value, long seconds) {
        return ResponseCookie.from(COOKIE, value).httpOnly(true).secure(true)
                .sameSite("Lax").path("/").maxAge(seconds).build().toString();
    }

    private boolean sameOrigin(HttpServletRequest request) {
        return origin.equals(request.getHeader("Origin"));
    }

    private JsonNode body(HttpServletRequest request, int maxBytes) throws IOException {
        byte[] bytes = request.getInputStream().readNBytes(maxBytes + 1);
        if (bytes.length > maxBytes) return null;
        try {
            JsonNode node = json.readTree(bytes);
            return node != null && node.isObject() ? node : null;
        } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) {
            return null;
        }
    }

    private JsonNode state(DemoAccounts.Account account) throws IOException {
        var node = json.createObjectNode().put("id", account.id()).put("email", account.email())
                .put("revision", account.revision());
        node.set("progress", account.progress() == null ? json.nullNode() : json.readTree(account.progress()));
        return node;
    }

    private boolean validProgress(JsonNode progress) {
        if (!progress.isObject() || progress.path("v").asInt(-1) != 1
                || !Set.of("en", "zh").contains(progress.path("lang").asText(""))
                || !Set.of("", "ai", "ds", "ba").contains(progress.path("recommended").asText("-"))
                || progress.size() != OBJECT_FIELDS.size() + 3) return false;
        for (String field : OBJECT_FIELDS) if (!progress.path(field).isObject()) return false;
        return safeProperties(progress, 0);
    }

    private boolean safeProperties(JsonNode value, int depth) {
        if (depth > 32) return false;
        Iterator<String> fields = value.fieldNames();
        while (fields.hasNext()) {
            if (Set.of("__proto__", "constructor", "prototype").contains(fields.next())) return false;
        }
        for (JsonNode child : value) if (!safeProperties(child, depth + 1)) return false;
        return true;
    }

    private static ResponseEntity<?> result(int status, Object body) {
        return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }

    private static ResponseEntity<?> error(int status, String code) {
        return result(status, Map.of("code", code));
    }
}
