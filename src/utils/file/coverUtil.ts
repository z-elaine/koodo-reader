import { isElectron } from "react-device-detect";
import BookModel from "../../models/Book";
import { getStorageLocation } from "../common";
import { Buffer } from "buffer";
import SyncService from "../storage/syncService";
import DatabaseService from "../storage/databaseService";
import Book from "../../models/Book";
import {
  CommonTool,
  ConfigService,
} from "../../assets/lib/kookit-extra-browser.min";
import { getCloudConfig } from "./common";
declare var window: any;

class CoverUtil {
  static getCover(book: BookModel) {
    if (isElectron) {
      var fs = window.require("fs");
      var path = window.require("path");
      let directoryPath = path.join(getStorageLocation() || "", "cover");
      const files = fs.readdirSync(directoryPath);
      const imageFiles = files.filter((file) => file.startsWith(book.key));
      if (imageFiles.length === 0) {
        return book.cover;
      }
      let format = imageFiles[0].split(".")[1];
      const imageFilePath = path.join(directoryPath, imageFiles[0]);
      let buffer = fs.readFileSync(imageFilePath);
      return `data:image/${format};base64,${buffer.toString("base64")}`;
    } else {
      return book.cover;
    }
  }
  static isCoverExist(book: BookModel) {
    if (isElectron) {
      var fs = window.require("fs");
      var path = window.require("path");
      let directoryPath = path.join(getStorageLocation() || "", "cover");
      if (!fs.existsSync(directoryPath)) {
        return false;
      }
      const files = fs.readdirSync(directoryPath);
      const imageFiles = files.filter((file) => file.startsWith(book.key));
      return imageFiles.length > 0;
    } else {
      return book.cover !== "";
    }
  }
  static deleteCover(key: string) {
    if (isElectron) {
      var fs = window.require("fs");
      var path = window.require("path");
      let directoryPath = path.join(getStorageLocation() || "", "cover");
      const files = fs.readdirSync(directoryPath);
      const imageFiles = files.filter((file) => file.startsWith(key));
      if (imageFiles.length === 0) {
        return;
      }
      const imageFilePath = path.join(directoryPath, imageFiles[0]);
      fs.unlinkSync(imageFilePath);
    }
  }
  static addCover(book: BookModel) {
    if (!book.cover) return;
    if (isElectron) {
      var fs = window.require("fs");
      var path = window.require("path");
      let directoryPath = path.join(getStorageLocation() || "", "cover");
      if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
      }
      const result = this.convertCoverBase64(book.cover);
      fs.writeFileSync(
        path.join(directoryPath, `${book.key}.${result.extension}`),
        Buffer.from(result.arrayBuffer)
      );
      book.cover = "";
    }
  }
  static convertCoverBase64(base64: string) {
    let mimeMatch = base64.match(/^data:(image\/\w+);base64,/);
    if (!mimeMatch) {
      let fileType = this.base64ToFileType(base64);
      if (!fileType) {
        throw new Error("Invalid base64 string");
      }
      mimeMatch = ["", `image/${fileType}`];
    }
    const mime = mimeMatch[1];

    let extension = mime.split("/")[1];

    const base64Data = base64.replace(/^data:.*;base64,/, "");

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const arrayBuffer = bytes.buffer;
    if (extension === "jpg") {
      extension = "jpeg";
    }

    return {
      arrayBuffer,
      extension,
    };
  }
  static base64ToFileType(base64: string) {
    // Decode base64 string to binary string
    base64 = base64.replace(/^data:.*;base64,/, "");
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine file type based on magic numbers
    const header = bytes.subarray(0, 4);
    let fileType = "unknown";
    const signatures: { [key: string]: string } = {
      "89504e47": "png",
      ffd8ffe0: "jpeg",
      ffd8ffe1: "jpeg",
      ffd8ffdb: "jpeg",
      ffd8ffe2: "jpeg",
      "47494638": "gif",
      "424d": "bmp",
      "49492a00": "tiff",
      "4d4d002a": "tiff",
      "52494646": "webp", // 'RIFF' followed by 'WEBP'
      "377abcaf271c": "webp", // WebP extended signature
      "3c3f786d6c": "svg",
      "00000100": "ico",
    };

    const headerHex = Array.from(header)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (signatures[headerHex]) {
      fileType = signatures[headerHex];
    }

    return fileType;
  }
  static async downloadCover(cover: string) {
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      let service = localStorage.getItem("defaultSyncOption");
      if (!service) {
        return;
      }
      let tokenConfig = await getCloudConfig(service);

      await ipcRenderer.invoke("cloud-download", {
        ...tokenConfig,
        fileName: cover,
        service: service,
        type: "cover",
        storagePath: getStorageLocation(),
      });
    } else {
      let syncUtil = await SyncService.getSyncUtil();
      let covers = await syncUtil.listFiles("cover");
      console.log(covers, "covers");

      let imgBuffer: ArrayBuffer = await syncUtil.downloadFile(cover, "cover");
      let imgStr = CommonTool.arrayBufferToBase64(imgBuffer);
      if (!imgStr) {
        console.log("download cover failed");
        return;
      }
      let base64 = `data:image/${
        cover.split(".").reverse()[0]
      };base64,${imgStr}`;
      console.log(base64, "base64");
      await this.saveCover(cover, base64);

      console.log("finish download cover");
    }
  }
  static async uploadCover(cover: string) {
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      let service = localStorage.getItem("defaultSyncOption");
      if (!service) {
        return;
      }
      let tokenConfig = await getCloudConfig(service);

      await ipcRenderer.invoke("cloud-upload", {
        ...tokenConfig,
        fileName: cover,
        service: service,
        type: "cover",
        storagePath: getStorageLocation(),
      });
    } else {
      let syncUtil = await SyncService.getSyncUtil();
      let book = await DatabaseService.getRecord(cover.split(".")[0], "books");
      console.log(book, "uploadCover");
      if (book && book.cover) {
        let result = this.convertCoverBase64(book.cover);
        let coverBlob = new Blob([result.arrayBuffer], {
          type: `image/${result.extension}`,
        });
        console.log(coverBlob, "coverBlob");
        await syncUtil.uploadFile(cover, "cover", coverBlob);
      }
    }
  }
  static async saveCover(cover: string, base64: string) {
    let book: Book = await DatabaseService.getRecord(
      cover.split(".")[0],
      "books"
    );
    console.log(book, "saveCover");
    if (book) {
      book.cover = base64;
      await DatabaseService.updateRecord(book, "books");
    }
  }
  static async getLocalCoverList() {
    if (isElectron) {
      var fs = window.require("fs");
      var path = window.require("path");
      let directoryPath = path.join(getStorageLocation() || "", "cover");
      if (!fs.existsSync(directoryPath)) {
        return [];
      }
      const files = fs.readdirSync(directoryPath);
      return files;
    } else {
      let books: Book[] | null = await DatabaseService.getAllRecords("books");
      return books
        ?.map((book) => {
          if (!book.cover) {
            return "";
          }
          return book.key + "." + this.base64ToFileType(book.cover);
        })
        .filter((item) => item !== "");
    }
  }
  static async getCloudCoverList() {
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      let service = localStorage.getItem("defaultSyncOption");
      if (!service) {
        return [];
      }
      let tokenConfig = await getCloudConfig(service);

      let cloudCoverList = await ipcRenderer.invoke("cloud-list", {
        ...tokenConfig,
        service: service,
        type: "cover",
      });
      return cloudCoverList;
    } else {
      let syncUtil = await SyncService.getSyncUtil();
      let cloudCoverList = await syncUtil.listFiles("cover");
      return cloudCoverList;
    }
  }
  static async deleteCloudCover(key: string) {
    let coverList = await this.getCloudCoverList();
    for (let cover of coverList) {
      if (cover.startsWith(key)) {
        if (isElectron) {
          const { ipcRenderer } = window.require("electron");
          let service = localStorage.getItem("defaultSyncOption");
          if (!service) {
            return;
          }
          let tokenConfig = await getCloudConfig(service);

          await ipcRenderer.invoke("cloud-delete", {
            ...tokenConfig,
            fileName: cover,
            service: service,
            type: "cover",
          });
        } else {
          let syncUtil = await SyncService.getSyncUtil();
          await syncUtil.deleteFile(cover, "cover");
        }
      }
    }
  }
}

export default CoverUtil;
