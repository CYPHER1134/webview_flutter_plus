import 'dart:convert';
import 'dart:typed_data';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:webview_flutter_plus/webview_flutter_plus.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final localhostServer = LocalhostServer();
  await localhostServer.start(port: 0);

  runApp(MyApp(localhostServer: localhostServer));
}

class MyApp extends StatelessWidget {
  final LocalhostServer localhostServer;
  const MyApp({super.key, required this.localhostServer});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'STL Viewer',
      theme: ThemeData(primarySwatch: Colors.blue),
      debugShowCheckedModeBanner: false,
      home: STLViewerPage(localhostServer: localhostServer),
    );
  }
}

class STLViewerPage extends StatefulWidget {
  final LocalhostServer localhostServer;
  const STLViewerPage({super.key, required this.localhostServer});

  @override
  State<STLViewerPage> createState() => _STLViewerPageState();
}

class _STLViewerPageState extends State<STLViewerPage> {
  late WebViewControllerPlus _controller;

  @override
  void initState() {
    super.initState();

    _controller = WebViewControllerPlus()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'FlutterLog',
        onMessageReceived: (msg) {
          // هر لاگی از JS با FlutterLog.postMessage میاد اینجا
          // برای دیباگ مفیده
          debugPrint('JS: ${msg.message}');
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg.message)));
        },
      )
      ..loadFlutterAssetWithServer(
        'assets/three_cube.html',
        widget.localhostServer.port!,
      );
  }

  Future<void> _pickSTLFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        withData: true, // سعی کن بایت‌ها را مستقیم بگیریم
        type: FileType.custom,
        allowedExtensions: ['stl'],
      );

      if (result == null) return;

      Uint8List? fileBytes = result.files.first.bytes;
      final path = result.files.first.path;

      // اگر فایل بزرگ بود ممکنه bytes تهی باشه؛ از مسیر بخونیم
      if (fileBytes == null && path != null) {
        fileBytes = await File(path).readAsBytes();
      }

      if (fileBytes == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('خواندن فایل ناموفق بود.')),
        );
        return;
      }

      final base64Data = base64Encode(fileBytes);
      // ارسال امن به JS
      final jsArg = jsonEncode(base64Data);
      await _controller.runJavaScript('loadSTLFromBase64($jsArg)');
    } catch (e) {
      debugPrint('Pick error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('خطا در انتخاب/ارسال فایل: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    widget.localhostServer.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('STL Viewer with ViewCube'),
        actions: [
          IconButton(
            tooltip: 'انتخاب فایل STL',
            icon: const Icon(Icons.upload_file),
            onPressed: _pickSTLFile,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: WebViewWidget(controller: _controller),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('برای بارگذاری STL روی آیکون بالا بزنید.'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _pickSTLFile,
        label: const Text('انتخاب فایل STL'),
        icon: const Icon(Icons.file_open),
      ),
    );
  }
}
