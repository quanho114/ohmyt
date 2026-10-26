// Feasibility probe only. Not a production sandbox or provider.
// By default creates a transient profile; --derive-only skips profile creation.
// Attempts LPAC launch without capabilities. Does not alter file ACLs.
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Security.Principal;
using System.IO;
class AppContainerProbe {
 [StructLayout(LayoutKind.Sequential)] struct SECURITY_CAPABILITIES { public IntPtr Sid; public IntPtr Capabilities; public uint Count; public uint Reserved; }
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public uint cb; public string reserved,desktop,title; public uint x,y,xs,ys,xc,yc,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO Info; public IntPtr Attributes; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr Process,Thread; public uint Pid,Tid; }
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr capabilities,uint count,out IntPtr sid);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFOEX startup,out PROCESS_INFORMATION process);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr handle,uint code);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static void Check(bool ok,string operation) { if(!ok) throw new Exception(operation+": Win32 "+Marshal.GetLastWin32Error()); }
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
 static void TokenDiagnostics() {
  IntPtr token; Check(OpenProcessToken(GetCurrentProcess(),8,out token),"Open current token");
  try {
   foreach(int kind in new int[]{18,20,29}) {
    IntPtr buffer=Marshal.AllocHGlobal(4); uint needed;
    try {bool ok=GetTokenInformation(token,kind,buffer,4,out needed); Console.WriteLine("TokenInformation["+kind+"]="+(ok?Marshal.ReadInt32(buffer).ToString():"error "+Marshal.GetLastWin32Error()));}
    finally {Marshal.FreeHGlobal(buffer);}
   }
  } finally {CloseHandle(token);}
 }
 static int Main(string[] args) {
  bool created=false; string profile="ohmyt-feasibility-"+Guid.NewGuid().ToString("N"); IntPtr sid=IntPtr.Zero,list=IntPtr.Zero,security=IntPtr.Zero,policy=IntPtr.Zero; PROCESS_INFORMATION process=new PROCESS_INFORMATION();
  try {
   TokenDiagnostics();
   Console.WriteLine("Identity="+WindowsIdentity.GetCurrent().Name+" OS="+Environment.OSVersion+" 64bit="+Environment.Is64BitProcess);
   Console.WriteLine("Startup sizes="+Marshal.SizeOf(typeof(STARTUPINFO))+","+Marshal.SizeOf(typeof(STARTUPINFOEX))+" capabilities="+Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)));
   int hr=args.Length>0 && args[0]=="--derive-only" ? DeriveAppContainerSidFromAppContainerName(profile,out sid) : CreateAppContainerProfile(profile,profile,"Temporary feasibility probe",IntPtr.Zero,0,out sid); if(hr<0) Marshal.ThrowExceptionForHR(hr); created=!(args.Length>0 && args[0]=="--derive-only");
   IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size); list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,2,0,ref size),"Initialize attributes");
   SECURITY_CAPABILITIES caps=new SECURITY_CAPABILITIES(); caps.Sid=sid; security=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SECURITY_CAPABILITIES))); Marshal.StructureToPtr(caps,security,false);
   Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20009),security,new IntPtr(Marshal.SizeOf(typeof(SECURITY_CAPABILITIES))),IntPtr.Zero,IntPtr.Zero),"Set security capabilities");
   policy=Marshal.AllocHGlobal(4); Marshal.WriteInt32(policy,1); Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000f),policy,new IntPtr(4),IntPtr.Zero,IntPtr.Zero),"Enable LPAC");
   STARTUPINFOEX startup=new STARTUPINFOEX(); startup.Info.cb=(uint)Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.Attributes=list;
   string exe=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe");
   string workingDirectory=Path.GetDirectoryName(exe);
   Console.WriteLine("Executable="+exe+" exists="+File.Exists(exe)+" cwd="+workingDirectory);
   Check(CreateProcessW(exe,new StringBuilder("\""+exe+"\" /d /c exit 37"),IntPtr.Zero,IntPtr.Zero,false,0x80000|0x08000000,IntPtr.Zero,workingDirectory,ref startup,out process),"Launch LPAC cmd");
   uint wait=WaitForSingleObject(process.Process,5000); if(wait!=0){TerminateProcess(process.Process,124);throw new Exception("LPAC child did not finish: wait="+wait);}
   uint code; Check(GetExitCodeProcess(process.Process,out code),"Exit code"); Console.WriteLine("LPAC child pid="+process.Pid+" exit="+code); return code==37?0:1;
  } catch(Exception error) {Console.Error.WriteLine(error.ToString());return 1;}
  finally {if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(process.Process!=IntPtr.Zero)CloseHandle(process.Process);if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}if(security!=IntPtr.Zero)Marshal.FreeHGlobal(security);if(policy!=IntPtr.Zero)Marshal.FreeHGlobal(policy);if(sid!=IntPtr.Zero)FreeSid(sid);if(created){int result=DeleteAppContainerProfile(profile);Console.WriteLine("Profile cleanup HRESULT=0x"+result.ToString("X8"));}}
 }
}
