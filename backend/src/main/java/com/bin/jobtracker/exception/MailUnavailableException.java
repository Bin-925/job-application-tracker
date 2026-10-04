package com.bin.jobtracker.exception;

public class MailUnavailableException extends RuntimeException {
    public MailUnavailableException() { super("인증 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요."); }
}
