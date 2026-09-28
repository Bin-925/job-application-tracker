package com.bin.jobtracker.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

@Configuration
@SecurityScheme(
        name = "sessionAuth",
        type = SecuritySchemeType.APIKEY,
        in = SecuritySchemeIn.COOKIE,
        paramName = "SESSION",
        description = "HttpOnly session cookie. Mutations also require X-CSRF-TOKEN from /api/v1/members/csrf."
)
@OpenAPIDefinition(security = @SecurityRequirement(name = "sessionAuth"))
public class SwaggerConfig {}
