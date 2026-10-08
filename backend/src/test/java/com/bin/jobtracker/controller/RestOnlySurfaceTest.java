package com.bin.jobtracker.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.servlet.view.xslt.XsltViewResolver;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class RestOnlySurfaceTest {
    @Autowired ApplicationContext context;
    @Autowired RequestMappingHandlerMapping mappings;

    @Test void applicationControllersDoNotEnableXsltOrServerRenderedSseFragments() {
        // These prerequisites must be reassessed before enabling the affected view features.
        assertThat(context.getBeansOfType(XsltViewResolver.class)).isEmpty();
        var applicationHandlers = mappings.getHandlerMethods().entrySet().stream()
                .filter(entry -> entry.getValue().getBeanType().getPackageName().startsWith("com.bin.jobtracker"))
                .toList();
        assertThat(applicationHandlers).isNotEmpty();
        for (var entry : applicationHandlers) {
            var handler = entry.getValue();
            assertThat(AnnotatedElementUtils.hasAnnotation(handler.getBeanType(), RestController.class)).isTrue();
            assertThat(entry.getKey().getProducesCondition().getProducibleMediaTypes()).doesNotContain(MediaType.TEXT_EVENT_STREAM);
            assertThat(handler.getReturnType().getParameterType().getName())
                    .doesNotContain("SseEmitter", "FragmentsRendering", "ModelAndView", "XsltView");
        }
    }
}
