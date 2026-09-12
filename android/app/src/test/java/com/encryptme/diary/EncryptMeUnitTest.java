package com.encryptme.diary;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class EncryptMeUnitTest {
    @Test
    public void testPackageMatchesApplicationNamespace() {
        assertEquals("com.encryptme.diary", EncryptMeUnitTest.class.getPackage().getName());
    }
}
