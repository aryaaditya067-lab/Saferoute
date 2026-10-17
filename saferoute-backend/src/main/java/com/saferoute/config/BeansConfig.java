package com.saferoute.config;

import com.saferoute.common.HttpFetcher;
import com.saferoute.common.JdkHttpFetcher;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BeansConfig {

    @Bean
    public HttpFetcher httpFetcher(SafeRouteProperties properties) {
        return new JdkHttpFetcher(properties.providers().userAgent());
    }

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
