package com.bin.jobtracker.exception;

public class DuplicateUsernameException extends IllegalArgumentException {
    public DuplicateUsernameException() {
        super("이미 사용 중인 아이디입니다.");
    }
}
