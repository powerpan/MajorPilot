package com.ruoyi.majorpilot.security;
import com.ruoyi.majorpilot.shared.Secrets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;
class CsrfServiceTest {
    @Test void boundaryBindingSignatureAndExpiryAreEnforced() { var csrf=new CsrfService(new Secrets("synthetic-key-".repeat(4)));var req=new MockHttpServletRequest();var res=new MockHttpServletResponse();String token=csrf.publicToken(req,res,"intake-hash");assertTrue(csrf.valid(token,"public","intake-hash"));assertFalse(csrf.valid(token,"student","intake-hash"));assertFalse(csrf.valid(token,"public","wrong-intake"));assertFalse(csrf.valid(token+"x","public","intake-hash"));assertFalse(csrf.valid(token.replaceFirst("[0-9]{10}","0000000000"),"public","intake-hash"));assertTrue(res.getHeader("Set-Cookie").contains("Path=/"));assertFalse(res.getHeader("Set-Cookie").contains("Domain=")); }
    @Test void anonymousRefreshUsesUnpredictableNonces() { var csrf=new CsrfService(new Secrets("synthetic-key-".repeat(4)));String first=csrf.publicToken(new MockHttpServletRequest(),new MockHttpServletResponse(),null),second=csrf.publicToken(new MockHttpServletRequest(),new MockHttpServletResponse(),null);assertNotEquals(first,second);assertTrue(csrf.valid(first,"public",null));assertFalse(csrf.valid(first,"public","later-intake")); }
}
