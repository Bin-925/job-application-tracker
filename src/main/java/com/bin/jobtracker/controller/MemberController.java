package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.service.MemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
public class MemberController {
    private final MemberService memberService;

    @PostMapping("/join")
    public ResponseEntity<String> join(@RequestBody @Valid JoinRequest req) {
        memberService.join(req.username(), req.password(), req.nickname());
        return ResponseEntity.status(HttpStatus.CREATED).body("회원가입 완료");
    }
}