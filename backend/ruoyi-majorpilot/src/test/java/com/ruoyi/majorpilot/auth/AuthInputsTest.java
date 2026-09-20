package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class AuthInputsTest {
    @Test void canonicalEmailDoesNotCollapseProviderAliases() { assertEquals("name+tag@example.invalid",AuthInputs.email(" Name+Tag@EXAMPLE.invalid "));assertNotEquals(AuthInputs.email("a.b@example.invalid"),AuthInputs.email("ab@example.invalid")); }
    @Test void headerInjectionAndDisplayNamesAreRejected() { for(String value:new String[]{"name@example.invalid\r\nBCC:a@example.invalid","Name <a@example.invalid>","a@example.invalid,b@example.invalid","a@localhost",""})assertThrows(ApiException.class,()->AuthInputs.email(value));assertThrows(ApiException.class,()->AuthInputs.email(null)); }
    @Test void passwordLengthCountsCodePointsAndDoesNotRequireCharacterClasses() { AuthInputs.newPassword("a".repeat(15));AuthInputs.newPassword("学".repeat(128));AuthInputs.newPassword("a long spaced passphrase");for(String value:new String[]{"a".repeat(14),"a".repeat(129),"long password\nwith newline"})assertThrows(ApiException.class,()->AuthInputs.newPassword(value)); }
    @Test void argon2HashesAreSaltedAndWrongPasswordsFail() { var passwords=new StudentPasswords();String value="synthetic passphrase 123",first=passwords.hash(value),second=passwords.hash(value);assertTrue(first.startsWith("$argon2id$"));assertNotEquals(first,second);assertTrue(passwords.matches(value,first));assertFalse(passwords.matches("another passphrase",first));assertFalse(passwords.matches(value,null)); }
}
