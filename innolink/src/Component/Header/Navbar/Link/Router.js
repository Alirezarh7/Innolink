import React from "react";
import { Route, Routes } from "react-router-dom"
import ContactUs from "../../../page/ContactUs/ContactUs"
import Project from '../../../page/Project/Project'
import Home from "../../../page/Home/Home";
import Navbar from "../Navbar";


const Router = () => {
  return(
    <>
    <Navbar/>
    <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/contactUs" element={<ContactUs/>} />
        <Route path="/project" element={<Project/>} />
    </Routes>
    </>
  )
}
export default Router