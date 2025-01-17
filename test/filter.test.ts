/**
 * trzsz: https://github.com/trzsz/trzsz.js
 * Copyright(c) 2023 Lonny Wong <lonnywong@qq.com>
 * @license MIT
 */

// @ts-nocheck

const os = require("os");
const fs = require("fs");
const path = require("path");
import * as comm from "../src/comm";
import * as browser from "../src/browser";
import { findTrzszMagicKey, TrzszFilter } from "../src/filter";
import { strToUint8, strToArrBuf, uint8ToStr, decodeBuffer } from "../src/comm";

/* eslint-disable require-jsdoc */

async function sleep(timeout: number) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

afterEach(() => {
  // @ts-ignore
  comm.isRunningInBrowser = false;
});

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "filter-test-"));
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true });
  } catch (err) {
    if (process.platform === "win32") {
      require("child_process").spawn("cmd", ["/c", "rmdir", "/s", "/q", tmpDir]);
    } else {
      require("child_process").spawn("rm", ["-rf", tmpDir]);
    }
  }
});

test("find trzsz magic key", async () => {
  async function testFindTrzszMagicKey(output: string | null, result: string | null) {
    expect(await findTrzszMagicKey(output)).toBe(result);
    if (output == null) {
      return;
    }
    expect(await findTrzszMagicKey(strToUint8(output))).toBe(result);
    expect(await findTrzszMagicKey(strToArrBuf(output))).toBe(result);
    expect(await findTrzszMagicKey(new Blob([output]))).toBe(result);
  }
  await testFindTrzszMagicKey(null, null);
  await testFindTrzszMagicKey("ABC", null);
  await testFindTrzszMagicKey("A::".repeat(10), null);
  const good = "::TRZSZ:TRANSFER";
  const fail = "::TRZSZ:TRANSFEX";
  const suffix = ":X:1.0.0:0";
  await testFindTrzszMagicKey(`${fail}${suffix}`, null);
  await testFindTrzszMagicKey(`${good}${suffix}`, `${good}${suffix}`);
  await testFindTrzszMagicKey(`A:A${fail}${suffix}`, null);
  await testFindTrzszMagicKey(`A:A${good}${suffix}`, `${good}${suffix}`);
  await testFindTrzszMagicKey(`:::${fail}${suffix}`, null);
  await testFindTrzszMagicKey(`:::${good}${suffix}`, `${good}${suffix}`);

  const arrBuf = strToUint8(`AAA${good}${suffix}`).buffer;
  expect(await findTrzszMagicKey(new Uint8Array(arrBuf, 3))).toBe(`${good}${suffix}`);
  expect(await findTrzszMagicKey(new Uint8Array(arrBuf, 23))).toBe(null);

  await testFindTrzszMagicKey(`:::${good}${suffix}:::${good}${suffix}1`, `${good}${suffix}1`);
});

test("default trzsz options for filter", () => {
  expect(() => new TrzszFilter(undefined)).toThrow("TrzszOptions is required");
  expect(() => new TrzszFilter({})).toThrow("writeToTerminal is required");
  expect(() => new TrzszFilter({ writeToTerminal: jest.fn() })).toThrow("sendToServer is required");

  const func = jest.fn();
  const tf = new TrzszFilter({
    writeToTerminal: func,
    sendToServer: func,
  });
  expect((tf as any).writeToTerminal).toBe(func);
  expect((tf as any).sendToServer).toBe(func);
  expect((tf as any).chooseSendFiles).toBe(undefined);
  expect((tf as any).chooseSaveDirectory).toBe(undefined);
  expect((tf as any).terminalColumns).toBe(80);
});

test("custom trzsz options for filter", () => {
  const func = jest.fn();
  const tf = new TrzszFilter({
    writeToTerminal: func,
    sendToServer: func,
    chooseSendFiles: func,
    chooseSaveDirectory: func,
    terminalColumns: 100,
  });
  expect((tf as any).writeToTerminal).toBe(func);
  expect((tf as any).sendToServer).toBe(func);
  expect((tf as any).chooseSendFiles).toBe(func);
  expect((tf as any).chooseSaveDirectory).toBe(func);
  expect((tf as any).terminalColumns).toBe(100);
});

test("process the terminal binary input", async () => {
  const options = {
    writeToTerminal: jest.fn(),
    sendToServer: jest.fn(),
    terminalColumns: 100,
  };
  const tf = new TrzszFilter(options);
  const uint8 = new Uint8Array(0x100);
  for (let i = 0; i < 0x100; i++) {
    uint8[i] = i;
  }
  tf.processBinaryInput(String.fromCharCode.apply(null, uint8));
  expect((options.sendToServer as jest.Mock).mock.calls.length).toBe(1);
  expect((options.writeToTerminal as jest.Mock).mock.calls.length).toBe(0);
  expect((options.sendToServer as jest.Mock).mock.calls[0][0]).toStrictEqual(uint8);
});

test("trz upload files", async () => {
  const testPath = path.join(tmpDir, "test.txt");
  const fd = fs.openSync(testPath, "w");
  fs.writeSync(fd, "test content\n");
  fs.closeSync(fd);

  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const chooseSendFiles = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
    chooseSendFiles: chooseSendFiles,
  });

  chooseSendFiles.mockReturnValueOnce([testPath]);

  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":R:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(1);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER" + ":R:1.0.0:0");

  await sleep(100);
  trzsz.processServerOutput("#CFG:eJyrVspJzEtXslJQKqhU0lFQSipNK86sSgUKGBqYWJiamwHFSjJzU/NLS8BiBrUAcT0OOQ==\n");
  trzsz.processServerOutput("#SUCC:1\n");
  trzsz.processServerOutput("#SUCC:eJwrSS0u0SupKNEzAAAWAwOt\n");
  await sleep(100);
  trzsz.processTerminalInput("user input");
  trzsz.processBinaryInput("binary input");
  trzsz.setTerminalColumns(100);
  trzsz.processServerOutput("#SUCC:13\n");
  trzsz.processServerOutput("#SUCC:13\n");
  trzsz.processServerOutput("#SUCC:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");

  await sleep(500);
  expect(chooseSendFiles.mock.calls.length).toBe(1);

  expect(sendToServer.mock.calls.length).toBe(7);
  expect(sendToServer.mock.calls[0][0]).toContain("#ACT:");
  expect(sendToServer.mock.calls[1][0]).toBe("#NUM:1\n");
  expect(sendToServer.mock.calls[2][0]).toBe("#NAME:eJwrSS0u0SupKAEADtkDTw==\n");
  expect(sendToServer.mock.calls[3][0]).toBe("#SIZE:13\n");
  expect(sendToServer.mock.calls[4][0]).toBe("#DATA:eJwrSS0uUUjOzytJzSvhAgAkDwTm\n");
  expect(sendToServer.mock.calls[5][0]).toBe("#MD5:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");
  expect(sendToServer.mock.calls[6][0]).toBe("#EXIT:eJwLTixLTVEwVEjLzEnVT8ksSk0uyS+q5OXSVShJLS7RK6ko0TMAAOH+DBk=\n");

  trzsz.processServerOutput("Received test.txt.0 to /tmp\n");

  expect(writeToTerminal.mock.calls.length).toBe(4);
  expect(writeToTerminal.mock.calls[1][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[2][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[3][0]).toBe("Received test.txt.0 to /tmp\n");
});

test("tsz download files", async () => {
  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const chooseSaveDirectory = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
    chooseSaveDirectory: chooseSaveDirectory,
  });

  chooseSaveDirectory.mockReturnValueOnce(tmpDir);

  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":S:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(1);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER" + ":S:1.0.0:0");

  await sleep(100);
  trzsz.processServerOutput(
    "#CFG:eJyrVspJzEtXslJQKqhU0lFQSipNK86sSgUKGBqYWJiamwHFSjJzU/NLS8BiBiB+bmlFPFCgoLQkPqs0LxsoUVJUmloLAF6AF9g=\n"
  );
  trzsz.processServerOutput("#NUM:1\n");
  trzsz.processServerOutput("#NAME:eJwrSS0u0SupKAEADtkDTw==\n");
  await sleep(100);
  trzsz.processTerminalInput("user input");
  trzsz.processBinaryInput("binary input");
  trzsz.setTerminalColumns(100);
  trzsz.processServerOutput("#SIZE:13\n");
  trzsz.processServerOutput("#DATA:eJwrSS0uUUjOzytJzSvhAgAkDwTm\n");
  trzsz.processServerOutput("#MD5:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");

  await sleep(500);
  expect(chooseSaveDirectory.mock.calls.length).toBe(1);

  expect(sendToServer.mock.calls.length).toBe(7);
  expect(sendToServer.mock.calls[0][0]).toContain("#ACT:");
  expect(sendToServer.mock.calls[1][0]).toBe("#SUCC:1\n");
  expect(sendToServer.mock.calls[2][0]).toBe("#SUCC:eJwrSS0u0SupKNEzAAAWAwOt\n");
  expect(sendToServer.mock.calls[3][0]).toBe("#SUCC:13\n");
  expect(sendToServer.mock.calls[4][0]).toBe("#SUCC:13\n");
  expect(sendToServer.mock.calls[5][0]).toBe("#SUCC:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");
  expect(sendToServer.mock.calls[6][0]).toContain("#EXIT:");

  trzsz.processServerOutput("Saved test.txt.0 to /tmp\n");

  expect(writeToTerminal.mock.calls.length).toBe(4);
  expect(writeToTerminal.mock.calls[1][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[2][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[3][0]).toBe("Saved test.txt.0 to /tmp\n");

  expect(fs.readFileSync(path.join(tmpDir, "test.txt.0")).toString()).toBe("test content\n");
});

test("stop transferring files", async () => {
  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const chooseSaveDirectory = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
    chooseSaveDirectory: chooseSaveDirectory,
  });

  trzsz.processServerOutput("::TRZSZ:TRANSFER:R:\n");
  trzsz.stopTransferringFiles();

  chooseSaveDirectory.mockReturnValueOnce(tmpDir);

  trzsz.processTerminalInput("tsz\n");
  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":S:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(2);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER:R:\n");
  expect(writeToTerminal.mock.calls[1][0]).toBe("::TRZSZ:TRANSFER" + ":S:1.0.0:0");

  await sleep(100);
  trzsz.processTerminalInput("\x03");

  await sleep(600);
  expect(chooseSaveDirectory.mock.calls.length).toBe(1);

  expect(sendToServer.mock.calls.length).toBe(3);
  expect(sendToServer.mock.calls[0][0]).toContain("tsz\n");
  expect(sendToServer.mock.calls[1][0]).toContain("#ACT:");
  expect(sendToServer.mock.calls[2][0]).toBe("#fail:eJwLLskvKEhNAQALbQLg\n");
});

test("cancel upload files", async () => {
  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const chooseSendFiles = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
    chooseSendFiles: chooseSendFiles,
  });

  chooseSendFiles.mockReturnValueOnce(undefined);

  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":R:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(1);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER" + ":R:1.0.0:0");

  await sleep(100);
  expect(chooseSendFiles.mock.calls.length).toBe(1);

  expect(sendToServer.mock.calls.length).toBe(1);
  const data = sendToServer.mock.calls[0][0];
  expect(data).toContain("#ACT:");
  const action = JSON.parse(await uint8ToStr(decodeBuffer(data.substring(5, data.length - 1)), "utf8"));
  expect(action.confirm).toBe(false);
});

test("cancel download files", async () => {
  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const chooseSaveDirectory = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
    chooseSaveDirectory: chooseSaveDirectory,
  });

  chooseSaveDirectory.mockReturnValueOnce(undefined);

  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":S:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(1);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER" + ":S:1.0.0:0");

  await sleep(100);
  expect(chooseSaveDirectory.mock.calls.length).toBe(1);

  expect(sendToServer.mock.calls.length).toBe(1);
  const data = sendToServer.mock.calls[0][0];
  expect(data).toContain("#ACT:");
  const action = JSON.parse(await uint8ToStr(decodeBuffer(data.substring(5, data.length - 1)), "utf8"));
  expect(action.confirm).toBe(false);
});

test("trz upload files in browser", async () => {
  // @ts-ignore
  comm.isRunningInBrowser = true;
  const selectSendFiles = jest.spyOn(browser, "selectSendFiles");

  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
  });
  selectSendFiles.mockResolvedValueOnce([
    {
      getPathId: () => {
        return 0;
      },
      getRelPath: () => {
        return ["test.txt"];
      },
      getSize: () => {
        return 13;
      },
      isDir: () => {
        return false;
      },
      readFile: async () => {
        return strToUint8("test content\n");
      },
      closeFile: () => {},
    },
  ]);

  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":R:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(1);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER" + ":R:1.0.0:0");

  await sleep(100);
  trzsz.processServerOutput("#CFG:eJyrVspJzEtXslJQKqhU0lFQSipNK86sSgUKGBqYWJiamwHFSjJzU/NLS8BiBrUAcT0OOQ==\n");
  trzsz.processServerOutput("#SUCC:1\n");
  trzsz.processServerOutput("#SUCC:eJwrSS0u0SupKNEzAAAWAwOt\n");
  await sleep(100);
  trzsz.processTerminalInput("user input");
  trzsz.processBinaryInput("binary input");
  trzsz.setTerminalColumns(100);
  trzsz.processServerOutput("#SUCC:13\n");
  trzsz.processServerOutput("#SUCC:13\n");
  trzsz.processServerOutput("#SUCC:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");

  await sleep(500);
  expect(selectSendFiles.mock.calls.length).toBe(1);

  expect(sendToServer.mock.calls.length).toBe(7);
  expect(sendToServer.mock.calls[0][0]).toContain("#ACT:");
  expect(sendToServer.mock.calls[1][0]).toBe("#NUM:1\n");
  expect(sendToServer.mock.calls[2][0]).toBe("#NAME:eJwrSS0u0SupKAEADtkDTw==\n");
  expect(sendToServer.mock.calls[3][0]).toBe("#SIZE:13\n");
  expect(sendToServer.mock.calls[4][0]).toBe("#DATA:eJwrSS0uUUjOzytJzSvhAgAkDwTm\n");
  expect(sendToServer.mock.calls[5][0]).toBe("#MD5:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");
  expect(sendToServer.mock.calls[6][0]).toBe("#EXIT:eJwLTixLTVEwVEjLzEnVT8ksSk0uyS+q5OXSVShJLS7RK6ko0TMAAOH+DBk=\n");

  trzsz.processServerOutput("Received test.txt.0 to /tmp\n");

  expect(writeToTerminal.mock.calls.length).toBe(4);
  expect(writeToTerminal.mock.calls[1][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[2][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[3][0]).toBe("Received test.txt.0 to /tmp\n");

  selectSendFiles.mockRestore();
});

test("tsz download files in browser", async () => {
  // @ts-ignore
  comm.isRunningInBrowser = true;
  const selectSaveDirectory = jest.spyOn(browser, "selectSaveDirectory");
  const openSaveFile = jest.spyOn(browser, "openSaveFile");

  const writeToTerminal = jest.fn();
  const sendToServer = jest.fn();
  const trzsz = new TrzszFilter({
    writeToTerminal: writeToTerminal,
    sendToServer: sendToServer,
  });
  const handle = {
    kind: "directory",
    name: "tmp",
  };
  const file = {
    closeFile: jest.fn(),
    getLocalName: jest.fn(),
    writeFile: jest.fn(),
    getFileName: () => "test.txt",
    isDir: () => false,
  };

  file.getLocalName.mockReturnValueOnce("test.txt.0");
  selectSaveDirectory.mockReturnValueOnce(handle as any);
  openSaveFile.mockResolvedValueOnce(file as any);

  trzsz.processServerOutput("::TRZSZ:TRANSFER" + ":S:1.0.0:0");
  expect(writeToTerminal.mock.calls.length).toBe(1);
  expect(writeToTerminal.mock.calls[0][0]).toBe("::TRZSZ:TRANSFER" + ":S:1.0.0:0");

  await sleep(100);
  trzsz.processServerOutput(
    "#CFG:eJyrVspJzEtXslJQKqhU0lFQSipNK86sSgUKGBqYWJiamwHFSjJzU/NLS8BiBiB+bmlFPFCgoLQkPqs0LxsoUVJUmloLAF6AF9g=\n"
  );
  trzsz.processServerOutput("#NUM:1\n");
  trzsz.processServerOutput("#NAME:eJwrSS0u0SupKAEADtkDTw==\n");
  await sleep(100);
  trzsz.processTerminalInput("user input");
  trzsz.processBinaryInput("binary input");
  trzsz.setTerminalColumns(100);
  trzsz.processServerOutput("#SIZE:13\n");
  trzsz.processServerOutput("#DATA:eJwrSS0uUUjOzytJzSvhAgAkDwTm\n");
  trzsz.processServerOutput("#MD5:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");

  await sleep(500);
  expect(selectSaveDirectory.mock.calls.length).toBe(1);
  expect(openSaveFile.mock.calls.length).toBe(1);
  expect(openSaveFile.mock.calls[0][1]).toBe("test.txt");

  expect(sendToServer.mock.calls.length).toBe(7);
  expect(sendToServer.mock.calls[0][0]).toContain("#ACT:");
  expect(sendToServer.mock.calls[1][0]).toBe("#SUCC:1\n");
  expect(sendToServer.mock.calls[2][0]).toBe("#SUCC:eJwrSS0u0SupKNEzAAAWAwOt\n");
  expect(sendToServer.mock.calls[3][0]).toBe("#SUCC:13\n");
  expect(sendToServer.mock.calls[4][0]).toBe("#SUCC:13\n");
  expect(sendToServer.mock.calls[5][0]).toBe("#SUCC:eJy79tqIQ6ZJ72rRdtb0pty5cwE+YAdb\n");
  expect(sendToServer.mock.calls[6][0]).toContain("#EXIT:");

  trzsz.processServerOutput("Saved test.txt.0 to /tmp\n");

  expect(writeToTerminal.mock.calls.length).toBe(4);
  expect(writeToTerminal.mock.calls[1][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[2][0]).toContain("test.txt [");
  expect(writeToTerminal.mock.calls[3][0]).toBe("Saved test.txt.0 to /tmp\n");

  expect(file.closeFile.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(file.getLocalName.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(file.writeFile.mock.calls.length).toBe(1);
  expect(file.writeFile.mock.calls[0][0]).toStrictEqual(strToUint8("test content\n"));

  openSaveFile.mockRestore();
});
